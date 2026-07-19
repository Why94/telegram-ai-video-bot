const dbMod = require("../inventory/db");
const inventory = require("../inventory/service");

// Store pending payment -> credit mapping in a table
function ensureTable() {
  const db = dbMod.getDb();
  db.run(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id TEXT,
      external_id TEXT,
      user_id TEXT NOT NULL,
      amount REAL,
      credit_amount INTEGER,
      status TEXT NOT NULL DEFAULT 'PENDING',
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function createPayment({ userId, invoiceId, externalId, amount, creditAmount, metadata = {} }) {
  ensureTable();
  const db = dbMod.getDb();
  const stmt = db.prepare(
    "INSERT INTO payments (invoice_id, external_id, user_id, amount, credit_amount, status, metadata) VALUES (?,?,?,?,?,?,?)"
  );
  stmt.run(invoiceId, externalId, String(userId), amount, creditAmount, "PENDING", JSON.stringify(metadata));
  dbMod.flush();
  return true;
}

function findPendingByExternalId(externalId) {
  const db = dbMod.getDb();
  const stmt = db.prepare("SELECT * FROM payments WHERE external_id=? AND status='PENDING'");
  stmt.bind([externalId]);
  let row = null;
  if (stmt.step()) row = stmt.getAsObject();
  stmt.free();
  return row;
}

function markPaid(externalId) {
  const db = dbMod.getDb();
  const pending = findPendingByExternalId(externalId);
  if (!pending) return null;

  db.prepare("UPDATE payments SET status='PAID', updated_at=datetime('now') WHERE external_id=?").run(externalId);
  dbMod.flush();

  // Credit the user
  const newBal = inventory.addCredit(pending.user_id, pending.credit_amount, {
    adminUserId: "XENDIT",
    reason: `payment ${pending.invoice_id}`,
  });

  return { userId: pending.user_id, creditAmount: pending.credit_amount, balance: newBal, amount: pending.amount };
}

function markFailed(externalId) {
  const db = dbMod.getDb();
  db.prepare("UPDATE payments SET status='FAILED', updated_at=datetime('now') WHERE external_id=?").run(externalId);
  dbMod.flush();
}

module.exports = { ensureTable, createPayment, findPendingByExternalId, markPaid, markFailed };
