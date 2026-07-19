const path = require("path");
const fs = require("fs");
const XLSX = require("xlsx");
const dbMod = require("./db");
const parser = require("./parser");

const EXPORT_DIR = path.resolve(__dirname, "..", "..", "data", "exports");
const ERROR_DIR = path.resolve(__dirname, "..", "..", "data", "errors");

function ensureDirs() {
  for (const d of [EXPORT_DIR, ERROR_DIR]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

// ─── pg query helpers (async) ───────────────────────────────────────────────
// Tolerate legacy call style q(db, sql, params) and q(sql, params).
function normalizeArgs(args) {
  if (args.length >= 2 && args[0] && typeof args[0] === "object" && !(args[0] instanceof String)) {
    // called as q(db, sql, params)
    return { sql: args[1], params: args[2] || [] };
  }
  return { sql: args[0], params: args[1] || [] };
}
function q(...args) {
  const { sql, params } = normalizeArgs(args);
  return dbMod.all(sql, params);
}
async function qOne(...args) {
  const { sql, params } = normalizeArgs(args);
  const rows = await q(sql, params);
  return rows[0] || null;
}
async function run(...args) {
  const { sql, params } = normalizeArgs(args);
  await dbMod.run(sql, params);
}
function build(sqlNamed, namedParams) {
  const names = [];
  const sql = sqlNamed.replace(/@(\w+)/g, (m, n) => {
    names.push(n);
    return "?";
  });
  const arr = names.map((n) => (namedParams[n] === undefined ? null : namedParams[n]));
  return { sql, arr };
}
async function qN(sqlNamed, namedParams = {}) {
  const { sql, arr } = build(sqlNamed, namedParams);
  return q(sql, arr);
}
async function qOneN(...args) {
  const namedParams = args.length >= 2 && args[0] && typeof args[0] === "object" && !(args[0] instanceof String)
    ? args[1]
    : args[0];
  const { sql, arr } = build(sqlNamedFromArgs(args), namedParams);
  const rows = await qN(sql, arr);
  return rows[0] || null;
}
function sqlNamedFromArgs(args) {
  if (args.length >= 2 && args[0] && typeof args[0] === "object" && !(args[0] instanceof String)) {
    return args[1];
  }
  return args[0];
}
async function runN(...args) {
  const namedParams = args.length >= 2 && args[0] && typeof args[0] === "object" && !(args[0] instanceof String)
    ? args[1]
    : args[0];
  const { sql, arr } = build(sqlNamedFromArgs(args), namedParams);
  return run(sql, arr);
}

function rowToAccount(rec) {
  const r = rec.raw;
  const status = (r.status || "AVAILABLE").toUpperCase();
  return {
    product_name: String(r.product_name).trim(),
    email: String(r.email).trim(),
    password: dbMod.encrypt(r.password),
    recovery_email: r.recovery_email ? String(r.recovery_email).trim() : null,
    recovery_password: r.recovery_password ? dbMod.encrypt(r.recovery_password) : null,
    profile_name: r.profile_name ? String(r.profile_name).trim() : null,
    country: r.country ? String(r.country).trim() : null,
    plan: r.plan ? String(r.plan).trim() : null,
    expire_date: r.expire_date ? String(r.expire_date).trim() : null,
    notes: r.notes ? String(r.notes).trim() : null,
    price: r.price ? String(r.price).trim() : null,
    api_key: r.api_key ? dbMod.encrypt(r.api_key) : null,
    status: parser.VALID_STATUS.includes(status) ? status : "AVAILABLE",
  };
}

/**
 * Import accounts from parsed file.
 * duplicateMode: "skip" | "replace" | "cancel"
 */
async function importAccounts({ buffer, filename, mime, duplicateMode, adminUserId }) {
  ensureDirs();
  const db = dbMod.getDb();

  if (duplicateMode === "cancel") return { cancelled: true };

  const startTime = Date.now();

  const existingEmails = new Set(
    (await qN("SELECT lower(email) AS e FROM accounts")).map((x) => (x.e || "").toLowerCase())
  );
  const existingByEmail = new Map(
    (await qN("SELECT id, lower(email) AS e FROM accounts")).map((x) => [(x.e || "").toLowerCase(), x.id])
  );

  const parsed = await parser.parseAndValidate(
    buffer, filename, mime,
    duplicateMode === "replace" ? null : existingEmails
  );

  let imported = 0;
  let skipped = parsed.counts.duplicates;

  if (duplicateMode === "replace") {
    for (const rec of parsed.valid) {
      const email = rec.raw.email.trim().toLowerCase();
      if (existingByEmail.has(email)) {
        await run("DELETE FROM accounts WHERE id=?", [existingByEmail.get(email)]);
      }
    }
  }

  const insertSql =
    "INSERT INTO accounts (product_name,email,password,recovery_email,recovery_password," +
    "profile_name,country,plan,expire_date,notes,price,status,api_key) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)";

  const batchSize = 1000;
  for (let i = 0; i < parsed.valid.length; i += batchSize) {
    const chunk = parsed.valid.slice(i, i + batchSize);
    for (const rec of chunk) {
      const a = rowToAccount(rec);
      await run(insertSql, [
        a.product_name, a.email, a.password, a.recovery_email, a.recovery_password,
        a.profile_name, a.country, a.plan, a.expire_date, a.notes, a.price, a.status, a.api_key,
      ]);
      imported++;
    }
  }
  dbMod.flush();

  const processingMs = Date.now() - startTime;

  let errorReportPath = null;
  if (parsed.errorRows.length) {
    const reportName = `errors_${Date.now()}.csv`;
    errorReportPath = path.join(ERROR_DIR, reportName);
    const header = ["row", "email", "errors"];
    const lines = parsed.errorRows.map((e) => [e.row, e.email || "", e.errors.join("; ")]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...lines]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Errors");
    XLSX.writeFile(wb, errorReportPath);
  }

  const histId = (await qOneN("SELECT COALESCE(MAX(id),0)+1 AS n FROM import_history")).n;
  await runN(
    `INSERT INTO import_history (filename,file_type,total_rows,imported,skipped,duplicates,
      invalid_email,invalid_product,failed_rows,processing_ms,duplicate_mode,admin_user_id,error_report_path)
     VALUES (@f,@t,@tr,@im,@sk,@dp,@ie,@ip,@fr,@pm,@dm,@au,@er)`,
    {
      f: filename, t: parsed.type, tr: parsed.total, im: imported, sk: skipped,
      dp: parsed.counts.duplicates, ie: parsed.counts.invalidEmail,
      ip: parsed.counts.invalidProduct, fr: parsed.counts.failed,
      pm: processingMs, dm: duplicateMode, au: String(adminUserId ?? ""),
      er: errorReportPath,
    }
  );
  dbMod.flush();

  await dbMod.audit("IMPORT_ACCOUNTS", adminUserId, "import", String(histId), {
    filename, imported, skipped, duplicates: parsed.counts.duplicates,
  });

  return {
    cancelled: false,
    summary: {
      totalRows: parsed.total,
      imported,
      skipped,
      duplicates: parsed.counts.duplicates,
      invalidEmail: parsed.counts.invalidEmail,
      invalidProduct: parsed.counts.invalidProduct,
      failedRows: parsed.counts.failed,
      processingMs,
    },
    errorReportPath,
  };
}

// ─── Search / Filter / Pagination ────────────────────────────────────────────
const STATUS_FILTERS = ["AVAILABLE", "RESERVED", "SOLD", "DISABLED", "EXPIRED"];

function buildWhere(filters = {}) {
  const where = [];
  const params = {};
  let i = 0;
  const add = (col, val, like = true) => {
    const p = "p" + i++;
    where.push(`${col} ${like ? "LIKE" : "="} @${p}`);
    params[p] = like ? `%${val}%` : val;
  };
  if (filters.email) add("email", filters.email);
  if (filters.product_name) add("product_name", filters.product_name);
  if (filters.plan) add("plan", filters.plan);
  if (filters.status) add("status", filters.status, false);
  if (filters.country) add("country", filters.country);
  if (filters.order_id) add("order_id", filters.order_id, false);
  if (filters.telegram_user_id) add("telegram_user_id", String(filters.telegram_user_id), false);
  return { clause: where.length ? "WHERE " + where.join(" AND ") : "", params };
}

function publicRow(r) {
  return {
    id: r.id, product_name: r.product_name, email: r.email,
    recovery_email: r.recovery_email, profile_name: r.profile_name,
    country: r.country, plan: r.plan, expire_date: r.expire_date,
    notes: r.notes, status: r.status, order_id: r.order_id,
    telegram_user_id: r.telegram_user_id, sold_at: r.sold_at,
    created_at: r.created_at, updated_at: r.updated_at, price: r.price,
  };
}

async function searchAccounts(filters = {}, { page = 1, pageSize = 25, sortBy = "id", sortDir = "DESC" } = {}) {
  const db = dbMod.getDb();
  const { clause, params } = buildWhere(filters);
  const allowedSort = ["id", "product_name", "email", "status", "country", "plan", "created_at", "updated_at"];
  const sort = allowedSort.includes(sortBy) ? sortBy : "id";
  const dir = sortDir === "ASC" ? "ASC" : "DESC";

  const total = (await qOneN(db, `SELECT COUNT(*) AS c FROM accounts ${clause}`, params)).c;
  const offset = (Math.max(1, page) - 1) * pageSize;

  const rows = await qN(db,
    `SELECT * FROM accounts ${clause} ORDER BY ${sort} ${dir} LIMIT @limit OFFSET @offset`,
    { ...params, limit: pageSize, offset }
  );

  return {
    total, page, pageSize,
    totalPages: Math.ceil(total / pageSize),
    rows: rows.map(publicRow),
  };
}

// ─── Export ──────────────────────────────────────────────────────────────────
async function exportAccounts({ format = "csv", filters = {}, ids = null }) {
  ensureDirs();
  const db = dbMod.getDb();
  let rows;
  if (ids && Array.isArray(ids) && ids.length) {
    const ph = ids.map(() => "?").join(",");
    rows = await q(db, `SELECT * FROM accounts WHERE id IN (${ph})`, ids);
  } else {
    const { clause, params } = buildWhere(filters);
    rows = await qN(db, `SELECT * FROM accounts ${clause}`, params);
  }

  const data = rows.map((r) => ({
    id: r.id, product_name: r.product_name, email: r.email,
    password: dbMod.decrypt(r.password),
    recovery_email: r.recovery_email,
    recovery_password: dbMod.decrypt(r.recovery_password),
    profile_name: r.profile_name, country: r.country, plan: r.plan,
    expire_date: r.expire_date, notes: r.notes, status: r.status,
    order_id: r.order_id, telegram_user_id: r.telegram_user_id, price: r.price,
  }));

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const ws = XLSX.utils.json_to_sheet(data.length ? data : [{}]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Inventory");
  const file = path.join(EXPORT_DIR, `inventory_${stamp}.${format === "excel" ? "xlsx" : "csv"}`);
  XLSX.writeFile(wb, file);
  return file;
}

// ─── Bulk Actions ────────────────────────────────────────────────────────────
async function bulkAction({ ids, action, adminUserId, targetProduct = null }) {
  const db = dbMod.getDb();
  if (!ids || !ids.length) return { affected: 0 };
  const ph = ids.map(() => "?").join(",");
  let affected = 0;

  if (action === "delete") {
    await run(db, `DELETE FROM accounts WHERE id IN (${ph})`, ids);
    dbMod.flush();
    affected = ids.length;
  } else if (action === "disable") {
    await run(db, `UPDATE accounts SET status='DISABLED', updated_at=now()::text WHERE id IN (${ph})`, ids);
    affected = ids.length;
  } else if (action === "enable") {
    await run(db, `UPDATE accounts SET status='AVAILABLE', updated_at=now()::text WHERE id IN (${ph}) AND status='DISABLED'`, ids);
    affected = ids.length;
  } else if (action === "move_product" && targetProduct) {
    const params = [targetProduct, ...ids];
    await run(db, `UPDATE accounts SET product_name=?, updated_at=now()::text WHERE id IN (${ph})`, params);
    affected = ids.length;
  }
  await dbMod.audit("BULK_ACTION", adminUserId, "accounts", ids.join(","), { action, affected, targetProduct });
  return { affected };
}

async function bulkChangeStatus({ ids, status, adminUserId }) {
  const db = dbMod.getDb();
  if (!ids || !ids.length || !parser.VALID_STATUS.includes(status)) return { affected: 0 };
  const ph = ids.map(() => "?").join(",");
  await run(db, `UPDATE accounts SET status=?, updated_at=now()::text WHERE id IN (${ph})`, [status, ...ids]);
  await dbMod.audit("BULK_STATUS", adminUserId, "accounts", ids.join(","), { status, affected: ids.length });
  return { affected: ids.length };
}

// ─── Statistics ──────────────────────────────────────────────────────────────
async function getStats() {
  const db = dbMod.getDb();
  const byStatus = {};
  for (const s of STATUS_FILTERS) byStatus[s] = 0;
  for (const r of await qN(db, "SELECT status, COUNT(*) AS c FROM accounts GROUP BY status")) {
    byStatus[r.status] = r.c;
  }
  const total = (await qOneN(db, "SELECT COUNT(*) AS c FROM accounts")).c;
  const todayUpload = (await qOneN(db,
    "SELECT COUNT(*) AS c FROM import_history WHERE created_at::date = now()::date")).c;
  const todaySales = (await qOneN(db,
    "SELECT COUNT(*) AS c FROM accounts WHERE status='SOLD' AND sold_at::date = now()::date")).c;

  const lowStockThreshold = parseInt(process.env.INVENTORY_LOW_STOCK || "10", 10);
  const lowStock = await qN(db,
    "SELECT product_name, COUNT(*) AS c FROM accounts WHERE status='AVAILABLE' GROUP BY product_name HAVING c <= ?",
    [lowStockThreshold]);

  const recentImports = await qN(db,
    "SELECT id, filename, imported, skipped, created_at FROM import_history ORDER BY id DESC LIMIT 5");

  return {
    total, byStatus,
    available: byStatus.AVAILABLE, reserved: byStatus.RESERVED,
    sold: byStatus.SOLD, disabled: byStatus.DISABLED, expired: byStatus.EXPIRED,
    remainingStock: byStatus.AVAILABLE,
    todayUpload, todaySales, lowStock, lowStockThreshold, recentImports,
  };
}

async function getImportHistory(limit = 20) {
  const db = dbMod.getDb();
  return qN(db, "SELECT * FROM import_history ORDER BY id DESC LIMIT ?", [limit]);
}

async function getProducts() {
  const db = dbMod.getDb();
  const rows = await qN(db, "SELECT DISTINCT product_name FROM accounts ORDER BY product_name");
  return rows.map((x) => x.product_name);
}

// ─── Purchase Integration Hooks ──────────────────────────────────────────────
async function reserveAccount(productName, { orderId, telegramUserId }) {
  const db = dbMod.getDb();
  const acc = await qOne(db,
    "SELECT * FROM accounts WHERE product_name=? AND status='AVAILABLE' ORDER BY id ASC LIMIT 1",
    [productName]);
  if (!acc) return null;
  await run(db,
    "UPDATE accounts SET status='RESERVED', order_id=?, telegram_user_id=?, updated_at=now()::text WHERE id=?",
    [orderId, String(telegramUserId), acc.id]);
  await dbMod.audit("RESERVE", null, "account", String(acc.id), { orderId, telegramUserId, productName });
  return { id: acc.id, email: acc.email, password: dbMod.decrypt(acc.password) };
}

async function releaseAccount(accountId, { orderId } = {}) {
  const db = dbMod.getDb();
  await run(db,
    "UPDATE accounts SET status='AVAILABLE', order_id=NULL, telegram_user_id=NULL, updated_at=now()::text WHERE id=? AND status='RESERVED'",
    [accountId]);
  await dbMod.audit("RELEASE", null, "account", String(accountId), { orderId });
  return true;
}

async function deliverAccount(accountId, { orderId, telegramUserId } = {}) {
  const db = dbMod.getDb();
  const acc = await qOne(db, "SELECT * FROM accounts WHERE id=?", [accountId]);
  if (!acc) return null;
  await run(db,
    "UPDATE accounts SET status='SOLD', order_id=?, telegram_user_id=?, sold_at=now()::text, updated_at=now()::text WHERE id=?",
    [orderId, String(telegramUserId), accountId]);
  await dbMod.audit("DELIVER", telegramUserId, "account", String(acc.id), { orderId, productName: acc.product_name });
  return {
    id: acc.id, product_name: acc.product_name, email: acc.email,
    password: dbMod.decrypt(acc.password),
    recovery_email: acc.recovery_email,
    recovery_password: dbMod.decrypt(acc.recovery_password),
    profile_name: acc.profile_name, notes: acc.notes,
  };
}

async function purchaseAccount(productName, { orderId, telegramUserId }) {
  const reserved = await reserveAccount(productName, { orderId, telegramUserId });
  if (!reserved) return { success: false, reason: "OUT_OF_STOCK" };
  const delivered = await deliverAccount(reserved.id, { orderId, telegramUserId });
  return { success: true, account: delivered };
}

// Reserve an AVAILABLE Leonardo account that has an api_key, mark it IN_USE for generation.
async function reserveLeonardoAccount(productName) {
  const db = dbMod.getDb();
  const acc = await qOne(db,
    "SELECT id, api_key FROM accounts WHERE product_name=? AND status='AVAILABLE' AND api_key IS NOT NULL ORDER BY id ASC LIMIT 1",
    [productName]);
  if (!acc) return null;
  await run(db,
    "UPDATE accounts SET status='IN_USE', updated_at=now()::text WHERE id=?",
    [acc.id]);
  await dbMod.audit("LEONARDO_RESERVE", null, "account", String(acc.id), { productName });
  return { id: acc.id, apiKey: dbMod.decrypt(acc.api_key) };
}

async function getErrorReportPath(historyId) {
  const db = dbMod.getDb();
  const r = await qOne(db, "SELECT error_report_path FROM import_history WHERE id=?", [historyId]);
  return r?.error_report_path || null;
}

// ─── User Credits ────────────────────────────────────────────────────────────
async function ensureUser(userId, { username = null, first_name = null } = {}) {
  const db = dbMod.getDb();
  const existing = await qOne(db, "SELECT * FROM users WHERE user_id=?", [String(userId)]);
  if (!existing) {
    await run(db,
      "INSERT INTO users (user_id, username, first_name, credit) VALUES (?,?,?,0)",
      [String(userId), username || null, first_name || null]);
    return { user_id: String(userId), credit: 0 };
  }
  if (username || first_name) {
    await runN(db, "UPDATE users SET username=COALESCE(@u,username), first_name=COALESCE(@f,first_name), updated_at=now()::text WHERE user_id=@id",
      { u: username || null, f: first_name || null, id: String(userId) });
  }
  return existing;
}

async function getCredit(userId) {
  const db = dbMod.getDb();
  const u = await qOne(db, "SELECT credit FROM users WHERE user_id=?", [String(userId)]);
  return u ? u.credit : 0;
}

async function addCredit(userId, amount, { adminUserId = null, reason = null } = {}) {
  const db = dbMod.getDb();
  await ensureUser(userId);
  await runN(db, "UPDATE users SET credit = credit + @amt, updated_at=now()::text WHERE user_id=@id",
    { amt: amount, id: String(userId) });
  await dbMod.audit("ADD_CREDIT", adminUserId, "user", String(userId), { amount, reason });
  return getCredit(userId);
}

async function deductCredit(userId, amount) {
  const db = dbMod.getDb();
  const u = await qOne(db, "SELECT credit FROM users WHERE user_id=?", [String(userId)]);
  if (!u || u.credit < amount) return false;
  await runN(db, "UPDATE users SET credit = credit - @amt, updated_at=now()::text WHERE user_id=@id",
    { amt: amount, id: String(userId) });
  return true;
}

// Purchase an account, paying with user credit. Returns result with success/reason.
async function purchaseWithCredit(productName, { telegramUserId, username = null, first_name = null, price = null }) {
  await ensureUser(telegramUserId, { username, first_name });
  let unitPrice = price;
  if (unitPrice == null) {
    const db = dbMod.getDb();
    const row = await qOne(db, "SELECT price FROM accounts WHERE product_name=? AND status='AVAILABLE' AND price IS NOT NULL LIMIT 1", [productName]);
    unitPrice = row?.price ? parsePrice(row.price) : 0;
  } else {
    unitPrice = parsePrice(String(unitPrice));
  }

  if (unitPrice > 0) {
    const bal = await getCredit(telegramUserId);
    if (bal < unitPrice) {
      return { success: false, reason: "INSUFFICIENT_CREDIT", needed: unitPrice, have: bal };
    }
  }

  const orderId = `CR-${telegramUserId}-${Date.now()}`;
  const reserved = await reserveAccount(productName, { orderId, telegramUserId });
  if (!reserved) return { success: false, reason: "OUT_OF_STOCK" };

  if (unitPrice > 0) await deductCredit(telegramUserId, unitPrice);
  const delivered = await deliverAccount(reserved.id, { orderId, telegramUserId });
  await dbMod.audit("PURCHASE_CREDIT", null, "account", String(reserved.id), { productName, price: unitPrice, orderId });
  return { success: true, account: delivered, price: unitPrice, balance: await getCredit(telegramUserId) };
}

// Parse price string like "50rb", "Rp50.000", "10$", "50000" into a number.
function parsePrice(str) {
  if (str == null) return 0;
  const s = String(str).toLowerCase().replace(/rp|\$|\s|\./g, "").trim();
  let num = parseFloat(s);
  if (isNaN(num)) return 0;
  if (/rb|k/.test(s)) num = Math.round(num * 1000);
  return Math.round(num);
}

module.exports = {
  importAccounts, searchAccounts, exportAccounts, bulkAction, bulkChangeStatus,
  getStats, getImportHistory, getProducts, reserveAccount, releaseAccount,
  deliverAccount, purchaseAccount, reserveLeonardoAccount, getErrorReportPath, ensureDirs,
  ensureUser, getCredit, addCredit, deductCredit, purchaseWithCredit, parsePrice,
};
