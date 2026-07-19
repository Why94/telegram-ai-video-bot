const crypto = require("crypto");

const API_KEY = process.env.XENDIT_API_KEY;
const WEBHOOK_TOKEN = process.env.XENDIT_WEBHOOK_TOKEN;
// Base URL for invoice API (use sandbox for testing)
const BASE_URL = process.env.XENDIT_BASE_URL || "https://api.xendit.co";

function isConfigured() {
  return !!(API_KEY && WEBHOOK_TOKEN);
}

/**
 * Create an invoice (payment request) for a given amount + description.
 * Returns { id, invoiceUrl, externalId } or throws.
 */
async function createInvoice({ amount, description, payerEmail = null, callbackUrl = null, metadata = {} }) {
  if (!API_KEY) throw new Error("XENDIT_API_KEY belum di-set");
  if (!amount || amount <= 0) throw new Error("Amount tidak valid");

  const externalId = `INV-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const payload = {
    external_id: externalId,
    amount: Math.round(amount),
    description: description || "Top up kredit",
    currency: "IDR",
    payer_email: payerEmail || undefined,
    callback_url: callbackUrl || undefined,
    success_redirect_url: callbackUrl || undefined,
    metadata,
  };

  const resp = await fetch(`${BASE_URL}/v2/invoices`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(API_KEY + ":").toString("base64"),
      "Content-Type": "application/json",
      "x-api-version": "2020-02-01",
    },
    body: JSON.stringify(payload),
  });

  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.message || JSON.stringify(data));
  }
  return {
    id: data.id,
    invoiceUrl: data.invoice_url,
    externalId: data.external_id,
    status: data.status,
    amount: data.amount,
  };
}

/**
 * Verify Xendit webhook authenticity.
 * Xendit sends header `x-callback-token` (for invoice callbacks) OR
 * a `xendit-signature` HMAC for some events. We support the callback-token method.
 */
function verifyWebhook(headers, rawBody) {
  if (!WEBHOOK_TOKEN) return false;
  const token = headers["x-callback-token"] || headers["x-callback-token".toLowerCase()];
  if (token && token === WEBHOOK_TOKEN) return true;

  // HMAC-SHA256 signature (for webhook-verification setting)
  const sig = headers["xendit-signature"] || headers["xendit-signature".toLowerCase()];
  if (sig && rawBody) {
    const hmac = crypto.createHmac("sha256", WEBHOOK_TOKEN).update(rawBody).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(sig));
  }
  return false;
}

/**
 * Parse the callback payload into a normalized event.
 * Returns { event, externalId, status, paid, amount, metadata }.
 */
function parseCallback(body) {
  // Xendit invoice callback fields
  const status = body.status; // PAID, EXPIRED, PENDING
  const paid = status === "PAID";
  return {
    event: body.event || "invoice",
    externalId: body.external_id,
    invoiceId: body.id,
    status,
    paid,
    amount: body.amount,
    metadata: body.metadata || {},
    raw: body,
  };
}

/**
 * Parse & validate Telegram Web App init data string.
 * Format: xnd_public_development_<base64payload>.<hmac>  (Telegram Login Widget style)
 * Returns { valid, hash, data } where data is the base64-decoded payload object.
 */
function parseWebAppInitData(raw) {
  if (!raw || typeof raw !== "string") return { valid: false, data: null };
  const dotIdx = raw.lastIndexOf(".");
  if (dotIdx === -1) return { valid: false, data: null };
  const payload = raw.slice(0, dotIdx);
  const hash = raw.slice(dotIdx + 1);
  let data = null;
  try {
    const json = Buffer.from(payload.replace(/^xnd_public_development_/, ""), "base64").toString("utf8");
    data = JSON.parse(json);
  } catch (e) {
    return { valid: false, data: null };
  }
  return { valid: true, hash, data };
}

module.exports = { isConfigured, createInvoice, verifyWebhook, parseCallback, parseWebAppInitData, API_KEY, WEBHOOK_TOKEN };
