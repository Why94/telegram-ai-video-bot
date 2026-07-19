const crypto = require("crypto");
const { Pool } = require("pg");

const config = require("../config");

// ─── Encryption (AES-256-GCM) ────────────────────────────────────────────────
const ENC_KEY = Buffer.from(
  (process.env.INVENTORY_ENCRYPTION_KEY || "change_me_to_a_long_random_secret_key")
    .padEnd(32, "*")
    .slice(0, 32)
);

function encrypt(plainText) {
  if (plainText === null || plainText === undefined || plainText === "") return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENC_KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plainText), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join("|");
}

function decrypt(payload) {
  if (!payload) return null;
  try {
    const [ivB64, tagB64, dataB64] = payload.split("|");
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const data = Buffer.from(dataB64, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", ENC_KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

// ─── sql.js-compatible wrapper over pg ────────────────────────────────────────
// Translates "?" positional params to pg "$1, $2, ..." and mimics the small
// subset of the sql.js API used across the codebase.

let pool = null;

function translateSql(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// Convert a JS array/value into pg parameter array.
function toParams(params) {
  if (params == null) return [];
  if (Array.isArray(params)) return params.map((v) => (v === undefined ? null : v));
  return [params === undefined ? null : params];
}

// Statement object mimicking sql.js prepare().bind().step().getAsObject().free()
function makeStatement(sql) {
  const pgSql = translateSql(sql);
  let bound = [];
  return {
    bind(params) {
      bound = toParams(params);
      return this;
    },
    async run(...args) {
      const p = args.length ? toParams(args[0]) : bound;
      await pool.query(pgSql, p);
      return this;
    },
    // Synchronous-style step() is not possible with pg; we pre-fetch via exec
    // for the few call sites that use prepare()+step()+getAsObject().
    step() {
      throw new Error("sync step() not supported under pg; use db.exec/db.all helpers");
    },
    getAsObject() {
      return {};
    },
    free() {},
  };
}

// The wrapper object returned by getDb(). Mirrors sql.js Database surface.
const dbWrapper = {
  run(sql, params) {
    return pool.query(translateSql(sql), toParams(params));
  },
  prepare(sql) {
    return makeStatement(sql);
  },
  // Returns sql.js-shaped result: [{ columns: [...], values: [[...]] }]
  async exec(sql) {
    const pgSql = translateSql(sql);
    // Multiple statements separated by ";" — run each, collect last result shape.
    const statements = pgSql.split(";").map((s) => s.trim()).filter(Boolean);
    let last = { columns: [], values: [] };
    for (const st of statements) {
      const res = await pool.query(st);
      if (res.fields && res.rows) {
        const columns = res.fields.map((f) => f.name);
        const values = res.rows.map((r) => columns.map((c) => r[c]));
        last = { columns, values };
      }
    }
    return [last];
  },
  // Convenience (not part of sql.js but handy)
  async all(sql, params) {
    const res = await pool.query(translateSql(sql), toParams(params));
    return res.rows;
  },
};

// ─── Schema bootstrap ──────────────────────────────────────────────────────────
async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS accounts (
      id SERIAL PRIMARY KEY,
      product_name TEXT NOT NULL,
      email TEXT NOT NULL,
      password TEXT,
      recovery_email TEXT,
      recovery_password TEXT,
      profile_name TEXT,
      country TEXT,
      plan TEXT,
      expire_date TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'AVAILABLE',
      order_id TEXT,
      telegram_user_id TEXT,
      sold_at TEXT,
      api_key TEXT,
      created_at TEXT NOT NULL DEFAULT (now()::text),
      updated_at TEXT NOT NULL DEFAULT (now()::text)
    );
    CREATE TABLE IF NOT EXISTS import_history (
      id SERIAL PRIMARY KEY,
      filename TEXT,
      file_type TEXT,
      total_rows INTEGER DEFAULT 0,
      imported INTEGER DEFAULT 0,
      skipped INTEGER DEFAULT 0,
      duplicates INTEGER DEFAULT 0,
      invalid_email INTEGER DEFAULT 0,
      invalid_product INTEGER DEFAULT 0,
      failed_rows INTEGER DEFAULT 0,
      processing_ms INTEGER DEFAULT 0,
      duplicate_mode TEXT,
      admin_user_id TEXT,
      error_report_path TEXT,
      created_at TEXT NOT NULL DEFAULT (now()::text)
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id SERIAL PRIMARY KEY,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      admin_user_id TEXT,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT (now()::text)
    );
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      credit INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (now()::text),
      updated_at TEXT NOT NULL DEFAULT (now()::text)
    );
    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      invoice_id TEXT,
      external_id TEXT,
      user_id TEXT,
      amount INTEGER,
      credit_amount INTEGER,
      status TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (now()::text),
      updated_at TEXT NOT NULL DEFAULT (now()::text)
    );
  `);

  // Add columns if missing (safe for existing DBs)
  const addCol = async (table, col, type) => {
    const r = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name=$1 AND column_name=$2`,
      [table, col]
    );
    if (r.rowCount === 0) {
      await pool.query(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
    }
  };
  await addCol("accounts", "price", "TEXT");
  await addCol("accounts", "api_key", "TEXT");

  // Indexes
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts(status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_accounts_product ON accounts(product_name)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_accounts_status_product ON accounts(status, product_name)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_payments_external ON payments(external_id)`);
}

// ─── Init / lifecycle ──────────────────────────────────────────────────────────
async function init() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL not set — cannot init inventory DB");
  }
  pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 5,
  });
  await pool.query("SELECT 1"); // verify connection
  await ensureSchema();
  return pool;
}

function getDb() {
  if (!pool) throw new Error("Inventory DB not initialized. Call init() first.");
  return dbWrapper;
}

// Persist no-ops (pg is already durable)
function save() {}
function flush() {}
function exportDb() {
  return Buffer.alloc(0);
}

// Thin wrapper
async function run(sql, params) {
  await pool.query(translateSql(sql), toParams(params));
}
async function exec(sql) {
  return dbWrapper.exec(sql);
}
function prepare(sql) {
  return makeStatement(sql);
}

// ─── Audit log ───────────────────────────────────────────────────────────────
async function audit(action, adminUserId, targetType = null, targetId = null, details = null) {
  try {
    await pool.query(
      `INSERT INTO audit_log (action, admin_user_id, target_type, target_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [action, String(adminUserId ?? ""), targetType, targetId, details ? JSON.stringify(details) : null]
    );
  } catch (e) {
    console.error("[inventory] audit log failed:", e.message);
  }
}

module.exports = {
  init,
  getDb,
  save,
  flush,
  run,
  exec,
  all: (sql, params) => dbWrapper.all(sql, params),
  prepare,
  encrypt,
  decrypt,
  audit,
  DB_PATH: process.env.DATABASE_URL || "(pg)",
};
