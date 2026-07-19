const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const initSqlJs = require("sql.js");

const config = require("../config");

// On Railway, persist to the mounted volume at /data so the DB survives restarts.
// Locally it falls back to ./data/inventory.db.
const DB_PATH = process.env.INVENTORY_DB_PATH ||
  (process.env.RAILWAY_ENVIRONMENT
    ? "/data/inventory.db"
    : path.resolve(__dirname, "..", "..", "data", "inventory.db"));

// ─── Encryption (AES-256-GCM) ────────────────────────────────────────────────
// Passwords are encrypted at rest. The key is never logged or exposed.
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

// ─── DB Init (sql.js — pure WASM, no native build) ──────────────────────────
let db = null;
let SQL = null;
let saveTimer = null;

// Initialize the sql.js WASM engine and open the DB. Must be awaited once at startup.
async function init() {
  if (SQL && db) return SQL;
  if (!SQL) SQL = await initSqlJs();
  if (!db) openDatabase();
  return SQL;
}

function getDb() {
  if (!db) throw new Error("Inventory DB not initialized. Call init() first.");
  return db;
}

// Internal: open (or create) the DB file. Called by init()/open().
function openDatabase() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  db = new SQL.Database();
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  }
  db.run(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS import_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      admin_user_id TEXT,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts(status);
    CREATE INDEX IF NOT EXISTS idx_accounts_product ON accounts(product_name);
    CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email);
    CREATE INDEX IF NOT EXISTS idx_accounts_country ON accounts(country);
    CREATE INDEX IF NOT EXISTS idx_accounts_plan ON accounts(plan);
    CREATE INDEX IF NOT EXISTS idx_accounts_status_product ON accounts(status, product_name);
    CREATE INDEX IF NOT EXISTS idx_accounts_telegram ON accounts(telegram_user_id);
    CREATE INDEX IF NOT EXISTS idx_accounts_order ON accounts(order_id);
    CREATE INDEX IF NOT EXISTS idx_accounts_created ON accounts(created_at);

    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      credit INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Add price column if missing (safe for existing DBs)
  try {
    db.run("ALTER TABLE accounts ADD COLUMN price TEXT");
  } catch (e) {
    // column already exists
  }

  // Add api_key column if missing (encrypted at rest)
  try {
    db.run("ALTER TABLE accounts ADD COLUMN api_key TEXT");
  } catch (e) {
    // column already exists
  }

  return db;
}

// Persist the in-memory DB to disk (debounced to avoid thrashing on bulk ops)
function save() {
  if (!db) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
    saveTimer = null;
  }, 200);
}

// Force an immediate flush (call after transactions)
function flush() {
  if (!db) return;
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// Thin wrapper to run a statement and auto-save
function run(sql, params) {
  const d = db;
  d.run(sql, params);
  save();
}
function exec(sql) { db.run(sql); save(); }
function prepare(sql) {
  const stmt = db.prepare(sql);
  return stmt;
}

// ─── Audit log ───────────────────────────────────────────────────────────────
function audit(action, adminUserId, targetType = null, targetId = null, details = null) {
  try {
    const d = db;
    d.run(
      `INSERT INTO audit_log (action, admin_user_id, target_type, target_id, details)
       VALUES (?, ?, ?, ?, ?)`,
      [action, String(adminUserId ?? ""), targetType, targetId, details ? JSON.stringify(details) : null]
    );
    save();
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
  prepare,
  encrypt,
  decrypt,
  audit,
  DB_PATH,
};
