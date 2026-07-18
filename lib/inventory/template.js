const path = require("path");
const fs = require("fs");
const XLSX = require("xlsx");
const parser = require("./parser");

const TEMPLATE_DIR = path.resolve(__dirname, "..", "..", "data", "templates");

const SAMPLE_ROW = {
  product_name: "Leonardo AI Premium",
  email: "account001@gmail.com",
  password: "password123",
  recovery_email: "recovery@gmail.com",
  recovery_password: "recovery123",
  profile_name: "Leonardo Premium",
  country: "Indonesia",
  plan: "Monthly",
  expire_date: "2026-12-31",
  notes: "Ready",
  status: "AVAILABLE",
  price: "50rb",
};

function ensureDir() {
  if (!fs.existsSync(TEMPLATE_DIR)) fs.mkdirSync(TEMPLATE_DIR, { recursive: true });
}

function generateCsvTemplate() {
  ensureDir();
  const header = parser.ALL_COLUMNS.join(",");
  const sample = parser.ALL_COLUMNS.map((c) => `"${SAMPLE_ROW[c] ?? ""}"`).join(",");
  const content = header + "\n" + sample + "\n";
  const file = path.join(TEMPLATE_DIR, "inventory_template.csv");
  fs.writeFileSync(file, content, "utf8");
  return file;
}

function generateExcelTemplate() {
  ensureDir();
  const ws = XLSX.utils.json_to_sheet([SAMPLE_ROW], { header: parser.ALL_COLUMNS });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Template");
  const file = path.join(TEMPLATE_DIR, "inventory_template.xlsx");
  XLSX.writeFile(wb, file);
  return file;
}

module.exports = { generateCsvTemplate, generateExcelTemplate, SAMPLE_ROW };
