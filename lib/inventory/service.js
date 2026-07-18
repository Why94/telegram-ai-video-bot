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

// ─── sql.js query helpers ─────────────────────────────────────────────────────
// sql.js prepared statements: stmt.bind(params); while(stmt.step()) rows.push(stmt.getAsObject());
function q(db, sql, params = {}) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}
function qOne(db, sql, params = {}) {
  const rows = q(db, sql, params);
  return rows[0] || null;
}
function run(db, sql, params = {}) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  stmt.step(); // execute
  stmt.free();
  dbMod.save();
}

// Convert named params (object) to positional array for sql.js (params are ?)
// We use a tiny helper that replaces @name with ? and builds an ordered array.
function build(db, sqlNamed, namedParams) {
  const names = [];
  const sql = sqlNamed.replace(/@(\w+)/g, (m, n) => {
    names.push(n);
    return "?";
  });
  const arr = names.map((n) => (namedParams[n] === undefined ? null : namedParams[n]));
  return { sql, arr };
}

// Re-implement q/run with support for @named params
function qN(db, sqlNamed, namedParams = {}) {
  const { sql, arr } = build(db, sqlNamed, namedParams);
  const stmt = db.prepare(sql);
  stmt.bind(arr);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}
function qOneN(db, sqlNamed, namedParams = {}) {
  return qN(db, sqlNamed, namedParams)[0] || null;
}
function runN(db, sqlNamed, namedParams = {}) {
  const { sql, arr } = build(db, sqlNamed, namedParams);
  const stmt = db.prepare(sql);
  stmt.bind(arr);
  stmt.step();
  stmt.free();
  dbMod.save();
}

function rowToAccount(rec) {
  const r = rec.raw;
  const status = (r.status || "AVAILABLE").toUpperCase();
  return {
    product_name: String(r.product_name).trim(),
    email: String(r.email).trim(),
    password: dbMod.encrypt(r.password),
    recovery_email: r.recovery_email ? String(r.recovery_email).trim() : null,
    recovery_password: dbMod.encrypt(r.recovery_password),
    profile_name: r.profile_name ? String(r.profile_name).trim() : null,
    country: r.country ? String(r.country).trim() : null,
    plan: r.plan ? String(r.plan).trim() : null,
    expire_date: r.expire_date ? String(r.expire_date).trim() : null,
    notes: r.notes ? String(r.notes).trim() : null,
    price: r.price ? String(r.price).trim() : null,
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

  // Existing emails
  const existingEmails = new Set(
    qN(db, "SELECT lower(email) AS e FROM accounts").map((x) => (x.e || "").toLowerCase())
  );
  const existingByEmail = new Map(
    qN(db, "SELECT id, lower(email) AS e FROM accounts").map((x) => [(x.e || "").toLowerCase(), x.id])
  );

  const parsed = await parser.parseAndValidate(
    buffer, filename, mime,
    duplicateMode === "replace" ? null : existingEmails
  );

  let imported = 0;
  let skipped = parsed.counts.duplicates;

  // Replace mode: delete matched rows
  if (duplicateMode === "replace") {
    for (const rec of parsed.valid) {
      const email = rec.raw.email.trim().toLowerCase();
      if (existingByEmail.has(email)) {
        run(db, "DELETE FROM accounts WHERE id=?", [existingByEmail.get(email)]);
      }
    }
  }

  const insertSql =
    "INSERT INTO accounts (product_name,email,password,recovery_email,recovery_password," +
    "profile_name,country,plan,expire_date,notes,price,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)";

  const batchSize = 1000;
  for (let i = 0; i < parsed.valid.length; i += batchSize) {
    const chunk = parsed.valid.slice(i, i + batchSize);
    for (const rec of chunk) {
      const a = rowToAccount(rec);
      run(db, insertSql, [
        a.product_name, a.email, a.password, a.recovery_email, a.recovery_password,
        a.profile_name, a.country, a.plan, a.expire_date, a.notes, a.price, a.status,
      ]);
      imported++;
    }
  }
  dbMod.flush();

  const processingMs = Date.now() - startTime;

  // Error report
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

  // Save history
  const histId = qOneN(db, "SELECT COALESCE(MAX(id),0)+1 AS n FROM import_history").n;
  runN(db,
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

  dbMod.audit("IMPORT_ACCOUNTS", adminUserId, "import", String(histId), {
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
  if (filters.created_from) add("created_at", filters.created_from, false);
  if (filters.created_to) add("created_at", filters.created_to, false);
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

function searchAccounts(filters = {}, { page = 1, pageSize = 25, sortBy = "id", sortDir = "DESC" } = {}) {
  const db = dbMod.getDb();
  const { clause, params } = buildWhere(filters);
  const allowedSort = ["id", "product_name", "email", "status", "country", "plan", "created_at", "updated_at"];
  const sort = allowedSort.includes(sortBy) ? sortBy : "id";
  const dir = sortDir === "ASC" ? "ASC" : "DESC";

  const total = qOneN(db, `SELECT COUNT(*) AS c FROM accounts ${clause}`, params).c;
  const offset = (Math.max(1, page) - 1) * pageSize;

  const rows = qN(db,
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
function exportAccounts({ format = "csv", filters = {}, ids = null }) {
  ensureDirs();
  const db = dbMod.getDb();
  let rows;
  if (ids && Array.isArray(ids) && ids.length) {
    const ph = ids.map(() => "?").join(",");
    rows = q(db, `SELECT * FROM accounts WHERE id IN (${ph})`, ids);
  } else {
    const { clause, params } = buildWhere(filters);
    rows = qN(db, `SELECT * FROM accounts ${clause}`, params);
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
function bulkAction({ ids, action, adminUserId, targetProduct = null }) {
  const db = dbMod.getDb();
  if (!ids || !ids.length) return { affected: 0 };
  const ph = ids.map(() => "?").join(",");
  let affected = 0;

  if (action === "delete") {
    run(db, `DELETE FROM accounts WHERE id IN (${ph})`, ids);
    dbMod.flush();
    affected = ids.length;
  } else if (action === "disable") {
    run(db, `UPDATE accounts SET status='DISABLED', updated_at=datetime('now') WHERE id IN (${ph})`, ids);
    affected = ids.length;
  } else if (action === "enable") {
    run(db, `UPDATE accounts SET status='AVAILABLE', updated_at=datetime('now') WHERE id IN (${ph}) AND status='DISABLED'`, ids);
    affected = ids.length;
  } else if (action === "move_product" && targetProduct) {
    const params = [targetProduct, ...ids];
    run(db, `UPDATE accounts SET product_name=?, updated_at=datetime('now') WHERE id IN (${ph})`, params);
    affected = ids.length;
  }
  dbMod.audit("BULK_ACTION", adminUserId, "accounts", ids.join(","), { action, affected, targetProduct });
  return { affected };
}

function bulkChangeStatus({ ids, status, adminUserId }) {
  const db = dbMod.getDb();
  if (!ids || !ids.length || !parser.VALID_STATUS.includes(status)) return { affected: 0 };
  const ph = ids.map(() => "?").join(",");
  run(db, `UPDATE accounts SET status=?, updated_at=datetime('now') WHERE id IN (${ph})`, [status, ...ids]);
  dbMod.audit("BULK_STATUS", adminUserId, "accounts", ids.join(","), { status, affected: ids.length });
  return { affected: ids.length };
}

// ─── Statistics ──────────────────────────────────────────────────────────────
function getStats() {
  const db = dbMod.getDb();
  const byStatus = {};
  for (const s of STATUS_FILTERS) byStatus[s] = 0;
  for (const r of qN(db, "SELECT status, COUNT(*) AS c FROM accounts GROUP BY status")) {
    byStatus[r.status] = r.c;
  }
  const total = qOneN(db, "SELECT COUNT(*) AS c FROM accounts").c;
  const todayUpload = qOneN(db,
    "SELECT COUNT(*) AS c FROM import_history WHERE date(created_at)=date('now')").c;
  const todaySales = qOneN(db,
    "SELECT COUNT(*) AS c FROM accounts WHERE status='SOLD' AND date(sold_at)=date('now')").c;

  const lowStockThreshold = parseInt(process.env.INVENTORY_LOW_STOCK || "10", 10);
  const lowStock = qN(db,
    "SELECT product_name, COUNT(*) AS c FROM accounts WHERE status='AVAILABLE' GROUP BY product_name HAVING c <= ?",
    [lowStockThreshold]);

  const recentImports = qN(db,
    "SELECT id, filename, imported, skipped, created_at FROM import_history ORDER BY id DESC LIMIT 5");

  return {
    total, byStatus,
    available: byStatus.AVAILABLE, reserved: byStatus.RESERVED,
    sold: byStatus.SOLD, disabled: byStatus.DISABLED, expired: byStatus.EXPIRED,
    remainingStock: byStatus.AVAILABLE,
    todayUpload, todaySales, lowStock, lowStockThreshold, recentImports,
  };
}

function getImportHistory(limit = 20) {
  const db = dbMod.getDb();
  return qN(db, "SELECT * FROM import_history ORDER BY id DESC LIMIT ?", [limit]);
}

function getProducts() {
  const db = dbMod.getDb();
  return qN(db, "SELECT DISTINCT product_name FROM accounts ORDER BY product_name").map((x) => x.product_name);
}

// ─── Purchase Integration Hooks (ready to plug into a store) ─────────────────
function reserveAccount(productName, { orderId, telegramUserId }) {
  const db = dbMod.getDb();
  const acc = qOne(db,
    "SELECT * FROM accounts WHERE product_name=? AND status='AVAILABLE' ORDER BY id ASC LIMIT 1",
    [productName]);
  if (!acc) return null;
  run(db,
    "UPDATE accounts SET status='RESERVED', order_id=?, telegram_user_id=?, updated_at=datetime('now') WHERE id=?",
    [orderId, String(telegramUserId), acc.id]);
  dbMod.audit("RESERVE", null, "account", String(acc.id), { orderId, telegramUserId, productName });
  return { id: acc.id, email: acc.email, password: dbMod.decrypt(acc.password) };
}

function releaseAccount(accountId, { orderId } = {}) {
  const db = dbMod.getDb();
  run(db,
    "UPDATE accounts SET status='AVAILABLE', order_id=NULL, telegram_user_id=NULL, updated_at=datetime('now') WHERE id=? AND status='RESERVED'",
    [accountId]);
  dbMod.audit("RELEASE", null, "account", String(accountId), { orderId });
  return true;
}

function deliverAccount(accountId, { orderId, telegramUserId } = {}) {
  const db = dbMod.getDb();
  const acc = qOne(db, "SELECT * FROM accounts WHERE id=?", [accountId]);
  if (!acc) return null;
  run(db,
    "UPDATE accounts SET status='SOLD', order_id=?, telegram_user_id=?, sold_at=datetime('now'), updated_at=datetime('now') WHERE id=?",
    [orderId, String(telegramUserId), accountId]);
  dbMod.audit("DELIVER", telegramUserId, "account", String(acc.id), { orderId, productName: acc.product_name });
  return {
    id: acc.id, product_name: acc.product_name, email: acc.email,
    password: dbMod.decrypt(acc.password),
    recovery_email: acc.recovery_email,
    recovery_password: dbMod.decrypt(acc.recovery_password),
    profile_name: acc.profile_name, notes: acc.notes,
  };
}

function purchaseAccount(productName, { orderId, telegramUserId }) {
  const reserved = reserveAccount(productName, { orderId, telegramUserId });
  if (!reserved) return { success: false, reason: "OUT_OF_STOCK" };
  const delivered = deliverAccount(reserved.id, { orderId, telegramUserId });
  return { success: true, account: delivered };
}

function getErrorReportPath(historyId) {
  const db = dbMod.getDb();
  const r = qOne(db, "SELECT error_report_path FROM import_history WHERE id=?", [historyId]);
  return r?.error_report_path || null;
}

module.exports = {
  importAccounts, searchAccounts, exportAccounts, bulkAction, bulkChangeStatus,
  getStats, getImportHistory, getProducts, reserveAccount, releaseAccount,
  deliverAccount, purchaseAccount, getErrorReportPath, ensureDirs,
};
