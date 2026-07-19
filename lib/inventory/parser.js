const XLSX = require("xlsx");

const REQUIRED_COLUMNS = ["product_name", "email"];
const ALL_COLUMNS = [
  "product_name",
  "email",
  "password",
  "recovery_email",
  "recovery_password",
  "profile_name",
  "country",
  "plan",
  "expire_date",
  "notes",
  "status",
  "price",
  "api_key",
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_STATUS = ["AVAILABLE", "RESERVED", "SOLD", "DISABLED", "EXPIRED", "IN_USE"];

function normalizeHeader(h) {
  return String(h ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\w]/g, "");
}

function detectType(filename, mime) {
  const lower = (filename || "").toLowerCase();
  if (lower.endsWith(".csv") || (mime || "").includes("csv")) return "csv";
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls") || (mime || "").includes("spreadsheet") || (mime || "").includes("excel"))
    return "excel";
  return "unknown";
}

// Read file → array of { row: number, raw: {...}, errors: [] }
function parseFile(buffer, filename, mime) {
  const type = detectType(filename, mime);
  if (type === "unknown") {
    throw new Error("Format file tidak didukung. Gunakan CSV atau XLSX.");
  }

  let rows;
  if (type === "csv") {
    const text = buffer.toString("utf8");
    const wb = XLSX.read(text, { type: "string" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(ws, { defval: "", raw: false });
  } else {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(ws, { defval: "", raw: false });
  }

  if (!rows.length) throw new Error("File kosong atau tidak ada data.");

  // Normalize headers on first row
  const firstKeys = Object.keys(rows[0]).map(normalizeHeader);
  const missing = REQUIRED_COLUMNS.filter((c) => !firstKeys.includes(c));
  if (missing.length) {
    throw new Error(`Header tidak valid. Kolom wajib hilang: ${missing.join(", ")}`);
  }

  const out = [];
  rows.forEach((r, i) => {
    const norm = {};
    for (const [k, v] of Object.entries(r)) {
      norm[normalizeHeader(k)] = v;
    }
    out.push({ row: i + 2, raw: norm, errors: [] }); // +2: header + 1-based
  });

  return { type, records: out };
}

// Validate a single normalized record. Returns list of error strings.
function validateRecord(rec) {
  const errors = [];
  const r = rec.raw;

  if (!r.product_name || !String(r.product_name).trim()) {
    errors.push("product_name kosong");
  }
  const email = (r.email || "").trim();
  if (!email) {
    errors.push("email kosong");
  } else if (!EMAIL_RE.test(email)) {
    errors.push("email tidak valid");
  }
  if (r.status && !VALID_STATUS.includes(String(r.status).toUpperCase())) {
    errors.push(`status tidak valid: ${r.status}`);
  }
  if (r.expire_date && isNaN(Date.parse(r.expire_date))) {
    errors.push(`expire_date tidak valid: ${r.expire_date}`);
  }
  return errors;
}

// Full pipeline: parse + validate + dedupe (within file + against DB)
// Returns structured result used by service.importAccounts
async function parseAndValidate(buffer, filename, mime, existingEmails) {
  const { type, records } = parseFile(buffer, filename, mime);

  const seenInFile = new Set();
  let invalidEmail = 0;
  let invalidProduct = 0;
  let duplicates = 0;
  let failed = 0;

  const valid = [];
  const errorRows = [];

  for (const rec of records) {
    // Skip fully empty rows
    const isEmpty = ALL_COLUMNS.every((c) => !rec.raw[c] || !String(rec.raw[c]).trim());
    if (isEmpty) continue;

    const errs = validateRecord(rec);
    const email = (rec.raw.email || "").trim().toLowerCase();

    if (errs.length) {
      failed++;
      if (errs.some((e) => e.includes("email tidak valid"))) invalidEmail++;
      if (errs.some((e) => e.includes("product_name"))) invalidProduct++;
      errorRows.push({ row: rec.row, email: rec.raw.email, errors: errs });
      continue;
    }

    // Duplicate within this file
    if (seenInFile.has(email)) {
      duplicates++;
      errorRows.push({ row: rec.row, email: rec.raw.email, errors: ["duplikat dalam file"] });
      continue;
    }
    // Duplicate against existing DB emails
    if (existingEmails && existingEmails.has(email)) {
      duplicates++;
      errorRows.push({ row: rec.row, email: rec.raw.email, errors: ["email sudah ada di inventory"] });
      continue;
    }

    seenInFile.add(email);
    valid.push(rec);
  }

  return {
    type,
    total: records.length,
    valid,
    errorRows,
    counts: { invalidEmail, invalidProduct, duplicates, failed },
  };
}

module.exports = {
  ALL_COLUMNS,
  REQUIRED_COLUMNS,
  VALID_STATUS,
  detectType,
  parseFile,
  validateRecord,
  parseAndValidate,
  EMAIL_RE,
};
