const dbMod = require("../inventory/db");
const inventory = require("../inventory/service");

// Store pending payment -> credit mapping in a table
async function ensureTable() {
  const db = dbMod.getDb();
  await db.run(`
    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      invoice_id TEXT,
      external_id TEXT,
      user_id TEXT NOT NULL,
      amount REAL,
      credit_amount INTEGER,
      status TEXT NOT NULL DEFAULT 'PENDING',
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (now()::text),
      updated_at TEXT NOT NULL DEFAULT (now()::text)
    );
  `);
}

async function createPayment({ userId, invoiceId, externalId, amount, creditAmount, metadata = {} }) {
  await ensureTable();
  await dbMod.run(
    "INSERT INTO payments (invoice_id, external_id, user_id, amount, credit_amount, status, metadata) VALUES (?,?,?,?,?,?,?)",
    [invoiceId, externalId, String(userId), amount, creditAmount, "PENDING", JSON.stringify(metadata)]
  );
  return true;
}

async function findPendingByExternalId(externalId) {
  const rows = await dbMod.all(
    "SELECT * FROM payments WHERE external_id=? AND status='PENDING'",
    [externalId]
  );
  return rows[0] || null;
}

async function markPaid(externalId) {
  const db = dbMod.getDb();
  const pending = await findPendingByExternalId(externalId);
  if (!pending) return null;

  await db.run("UPDATE payments SET status='PAID', updated_at=now()::text WHERE external_id=?", [externalId]);

  const newBal = await inventory.addCredit(pending.user_id, pending.credit_amount, {
    adminUserId: "XENDIT",
    reason: `payment ${pending.invoice_id}`,
  });

  return { userId: pending.user_id, creditAmount: pending.credit_amount, balance: newBal, amount: pending.amount };
}

async function markFailed(externalId) {
  const db = dbMod.getDb();
  await db.run("UPDATE payments SET status='FAILED', updated_at=now()::text WHERE external_id=?", [externalId]);
}

module.exports = { ensureTable, createPayment, findPendingByExternalId, markPaid, markFailed };
