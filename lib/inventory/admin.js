const { InlineKeyboard, InputFile } = require("grammy");
const service = require("./service");
const template = require("./template");
const dbMod = require("./db");

function qOne(sql, params = []) {
  const db = dbMod.getDb();
  const stmt = db.prepare(sql);
  stmt.bind(params);
  let row = null;
  if (stmt.step()) row = stmt.getAsObject();
  stmt.free();
  return row;
}
function qAll(sql, params = []) {
  const db = dbMod.getDb();
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

const STATUS_EMOJI = {
  AVAILABLE: "🟢",
  RESERVED: "🟡",
  SOLD: "🔴",
  DISABLED: "⚫",
  EXPIRED: "🟣",
};

// Pending upload state (per admin user) — awaiting duplicate-mode choice
const pendingUploads = new Map();

function isAdmin(ctx) {
  const id = String(ctx.from?.id);
  const admins = (process.env.ADMIN_USER_IDS || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return admins.includes(id);
}

function adminGuard(ctx) {
  if (!isAdmin(ctx)) {
    ctx.reply("⛔ Akses ditolak. Hanya admin yang dapat menggunakan fitur ini.");
    return false;
  }
  return true;
}

// ─── Admin Menu ──────────────────────────────────────────────────────────────
function adminMenuKeyboard() {
  return new InlineKeyboard()
    .text("📊 Dashboard", "inv:dashboard")
    .text("📦 Products", "inv:products")
    .row()
    .text("📥 Upload CSV", "inv:upload_csv")
    .text("📥 Upload Excel", "inv:upload_xlsx")
    .row()
    .text("📄 Template", "inv:template")
    .text("🕑 Import History", "inv:history")
    .row()
    .text("🔍 Search", "inv:search")
    .text("🔁 Bulk Actions", "inv:bulk")
    .row()
    .text("📤 Export", "inv:export")
    .text("⚠️ Duplicates", "inv:duplicates");
}

function inventorySectionKeyboard() {
  return new InlineKeyboard()
    .text("📊 Stock Stats", "inv:stats")
    .text("📥 Upload", "inv:upload_csv")
    .row()
    .text("🔍 Search", "inv:search")
    .text("📤 Export", "inv:export")
    .row()
    .text("🔙 Back", "inv:menu");
}

async function showAdminMenu(ctx) {
  if (!adminGuard(ctx)) return;
  await ctx.reply(
    "╭━━━━━━━━━━━━━━━━━━━━━╮\n" +
    "┃   🛠️ *ADMIN PANEL*   ┃\n" +
    "╰━━━━━━━━━━━━━━━━━━━━━╯\n\n" +
    "Kelola inventory akun digital:\n" +
    "Leonardo AI, ChatGPT Plus, Canva, Netflix, Spotify, dll.\n\n" +
    "Pilih menu:",
    { parse_mode: "Markdown", reply_markup: adminMenuKeyboard() }
  );
}

async function showDashboard(ctx) {
  if (!adminGuard(ctx)) return;
  const s = service.getStats();
  const lowStock = s.lowStock.length
    ? s.lowStock.map((l) => `  • ${l.product_name}: ${l.c}`).join("\n")
    : "  (none)";
  const recent = s.recentImports.length
    ? s.recentImports.map((r) => `  • #${r.id} ${r.filename}: +${r.imported}`).join("\n")
    : "  (none)";

  await ctx.reply(
    "📊 *DASHBOARD — ACCOUNT INVENTORY*\n\n" +
    `👥 Total Akun: *${s.total}*\n` +
    `${STATUS_EMOJI.AVAILABLE} Available: ${s.available}\n` +
    `${STATUS_EMOJI.RESERVED} Reserved: ${s.reserved}\n` +
    `${STATUS_EMOJI.SOLD} Sold: ${s.sold}\n` +
    `${STATUS_EMOJI.DISABLED} Disabled: ${s.disabled}\n` +
    `${STATUS_EMOJI.EXPIRED} Expired: ${s.expired}\n\n` +
    `📥 Upload Hari Ini: ${s.todayUpload}\n` +
    `💰 Sales Hari Ini: ${s.todaySales}\n` +
    `📦 Sisa Stock: ${s.remainingStock}\n\n` +
    `⚠️ *Low Stock (≤${s.lowStockThreshold}):*\n${lowStock}\n\n` +
    `🕑 *Recent Imports:*\n${recent}`,
    { parse_mode: "Markdown", reply_markup: inventorySectionKeyboard() }
  );
}

async function showProducts(ctx) {
  if (!adminGuard(ctx)) return;
  const products = service.getProducts();
  if (!products.length) {
    await ctx.reply("📦 Belum ada produk di inventory.", { reply_markup: inventorySectionKeyboard() });
    return;
  }
  const lines = [];
  for (const p of products) {
    const avail = qOne("SELECT COUNT(*) AS c FROM accounts WHERE product_name=? AND status='AVAILABLE'", [p]).c;
    const total = qOne("SELECT COUNT(*) AS c FROM accounts WHERE product_name=?", [p]).c;
    lines.push(`• ${p}: ${avail}/${total} 🟢`);
  }
  await ctx.reply(
    "📦 *PRODUCTS*\n\n" + lines.join("\n"),
    { parse_mode: "Markdown", reply_markup: inventorySectionKeyboard() }
  );
}

async function showStats(ctx) {
  return showDashboard(ctx);
}

async function showHistory(ctx) {
  if (!adminGuard(ctx)) return;
  const hist = service.getImportHistory(15);
  if (!hist.length) {
    await ctx.reply("🕑 Belum ada import history.", { reply_markup: inventorySectionKeyboard() });
    return;
  }
  const lines = hist.map((h) =>
    `#${h.id} | ${h.filename || "?"} | ${h.file_type}\n` +
    `  ✅${h.imported} ⏭️${h.skipped} ⚠️${h.duplicates} ❌${h.failed_rows} | ${h.processing_ms}ms`
  );
  await ctx.reply(
    "🕑 *IMPORT HISTORY*\n\n" + lines.join("\n\n"),
    { parse_mode: "Markdown", reply_markup: inventorySectionKeyboard() }
  );
}

async function showDuplicates(ctx) {
  if (!adminGuard(ctx)) return;
  const dup = qAll(`
    SELECT email, COUNT(*) AS c FROM accounts GROUP BY lower(email) HAVING c > 1
  `);
  if (!dup.length) {
    await ctx.reply("✅ Tidak ada duplikat email ditemukan.", { reply_markup: inventorySectionKeyboard() });
    return;
  }
  const lines = dup.slice(0, 30).map((x) => `• ${x.email}: ${x.c}x`);
  await ctx.reply(
    `⚠️ *DUPLICATE EMAILS (${dup.length} total)*\n\n` + lines.join("\n") +
    `\n\nGunakan Bulk Actions → Delete untuk membersihkan.`,
    { parse_mode: "Markdown", reply_markup: inventorySectionKeyboard() }
  );
}

// ─── Template ────────────────────────────────────────────────────────────────
async function sendTemplate(ctx) {
  if (!adminGuard(ctx)) return;
  const csv = template.generateCsvTemplate();
  const xlsx = template.generateExcelTemplate();
  await ctx.replyWithDocument(new InputFile(csv), { caption: "📄 Template CSV" });
  await ctx.replyWithDocument(new InputFile(xlsx), {
    caption: "📄 Template Excel (XLSX)",
    reply_markup: inventorySectionKeyboard(),
  });
}

// ─── Upload flow ─────────────────────────────────────────────────────────────
async function beginUpload(ctx, expectedType) {
  if (!adminGuard(ctx)) return;
  pendingUploads.set(ctx.from.id, { expectedType, stage: "await_file" });
  await ctx.reply(
    `📥 *UPLOAD ${expectedType.toUpperCase()}*\n\n` +
    "Kirim file CSV/XLSX (max 100MB, 100.000 baris).\n" +
    "Kolom: product_name, email, password, recovery_email, recovery_password, profile_name, country, plan, expire_date, notes, status\n\n" +
    "⏳ Menunggu file...",
    { parse_mode: "Markdown" }
  );
}

function askDuplicateMode(ctx, meta) {
  const kb = new InlineKeyboard()
    .text("⏭️ Skip Existing", "inv:dup_skip")
    .text("♻️ Replace Existing", "inv:dup_replace")
    .row()
    .text("❌ Cancel", "inv:dup_cancel");
  pendingUploads.set(ctx.from.id, { stage: "await_mode", ...meta });
  return kb;
}

// Handle an uploaded document
async function handleUpload(ctx) {
  if (!adminGuard(ctx)) return;
  const pending = pendingUploads.get(ctx.from.id);
  if (!pending || pending.stage !== "await_file") return;

  const doc = ctx.message.document;
  if (!doc) {
    await ctx.reply("❌ Kirim file dokumen (CSV/XLSX).");
    return;
  }
  const filename = doc.file_name || "upload";
  const mime = doc.mime_type || "";
  const type = require("./parser").detectType(filename, mime);

  if (type === "unknown") {
    await ctx.reply("❌ Format tidak didukung. Gunakan CSV atau XLSX.");
    return;
  }

  if (doc.file_size > 100 * 1024 * 1024) {
    await ctx.reply("❌ File terlalu besar (max 100MB).");
    return;
  }

  await ctx.reply("📥 Mengunduh & membaca file...");
  const file = await ctx.api.getFile(doc.file_id);
  const url = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;
  const res = await fetch(url);
  const buffer = Buffer.from(await res.arrayBuffer());

  pendingUploads.set(ctx.from.id, { stage: "preview", buffer, filename, mime, type });
  const kb = askDuplicateMode(ctx);
  await ctx.reply(
    `📄 File diterima: *${filename}*\nTipe: ${type.toUpperCase()}\n\n` +
    "Bagaimana menangani email yang sudah ada?",
    { parse_mode: "Markdown", reply_markup: kb }
  );
}

async function processImport(ctx, mode) {
  const pending = pendingUploads.get(ctx.from.id);
  if (!pending || pending.stage !== "preview") return;
  pendingUploads.delete(ctx.from.id);

  if (mode === "cancel") {
    await ctx.reply("❌ Import dibatalkan.");
    return;
  }

  const statusMsg = await ctx.reply("⏳ Memproses import... (batch processing)");
  const t0 = Date.now();
  try {
    const result = await service.importAccounts({
      buffer: pending.buffer,
      filename: pending.filename,
      mime: pending.mime,
      duplicateMode: mode,
      adminUserId: ctx.from.id,
    });

    if (result.cancelled) {
      await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, "❌ Import dibatalkan.");
      return;
    }

    const s = result.summary;
    let reportNote = "";
    if (result.errorReportPath) {
      reportNote = "\n\n📎 Error report dikirim.";
    }
    await ctx.api.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      "✅ *IMPORT SELESAI*\n\n" +
      `📋 Total Rows: ${s.totalRows}\n` +
      `✅ Imported: ${s.imported}\n` +
      `⏭️ Skipped: ${s.skipped}\n` +
      `⚠️ Duplicates: ${s.duplicates}\n` +
      `📧 Invalid Email: ${s.invalidEmail}\n` +
      `📦 Invalid Product: ${s.invalidProduct}\n` +
      `❌ Failed Rows: ${s.failedRows}\n` +
      `⏱️ Processing: ${s.processingMs}ms` + reportNote,
      { parse_mode: "Markdown", reply_markup: inventorySectionKeyboard() }
    );

    if (result.errorReportPath) {
      await ctx.replyWithDocument(new InputFile(result.errorReportPath), {
        caption: "📎 Laporan baris yang gagal/duplikat",
      });
    }
  } catch (e) {
    await ctx.api.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      "❌ Import gagal: " + e.message.replace(/[_*`]/g, "")
    );
  }
}

// ─── Search ──────────────────────────────────────────────────────────────────
async function showSearch(ctx) {
  if (!adminGuard(ctx)) return;
  const kb = new InlineKeyboard()
    .text("🟢 Available", "inv:filter:AVAILABLE")
    .text("🟡 Reserved", "inv:filter:RESERVED")
    .row()
    .text("🔴 Sold", "inv:filter:SOLD")
    .text("⚫ Disabled", "inv:filter:DISABLED")
    .row()
    .text("🟣 Expired", "inv:filter:EXPIRED")
    .row()
    .text("🔍 Search by Email", "inv:search_email")
    .text("🔙 Back", "inv:menu");
  await ctx.reply(
    "🔍 *SEARCH / FILTER*\n\nGunakan filter status, atau cari via command:\n" +
    "`/invsearch email=xxx product=yyy status=AVAILABLE`",
    { parse_mode: "Markdown", reply_markup: kb }
  );
}

async function runSearch(ctx, filters, page = 1) {
  if (!adminGuard(ctx)) return;
  const result = service.searchAccounts(filters, { page, pageSize: 10 });
  if (!result.rows.length) {
    await ctx.reply("🔍 Tidak ada hasil.", { reply_markup: inventorySectionKeyboard() });
    return;
  }
  const lines = result.rows.map((r) =>
    `${STATUS_EMOJI[r.status] || "•"} #${r.id} ${r.product_name}\n` +
    `  📧 ${r.email} | ${r.country || "-"} | ${r.plan || "-"}`
  );
  await ctx.reply(
    `🔍 *HASIL (${result.total})* — page ${result.page}/${result.totalPages}\n\n` +
    lines.join("\n\n"),
    { parse_mode: "Markdown", reply_markup: inventorySectionKeyboard() }
  );
}

// ─── Export ──────────────────────────────────────────────────────────────────
async function showExport(ctx) {
  if (!adminGuard(ctx)) return;
  const kb = new InlineKeyboard()
    .text("📤 Export CSV", "inv:export_csv")
    .text("📤 Export Excel", "inv:export_xlsx")
    .row()
    .text("🟢 Only Available", "inv:export_avail")
    .text("🔙 Back", "inv:menu");
  await ctx.reply(
    "📤 *EXPORT INVENTORY*\n\nPassword akan didekripsi (admin only).\nPilih format:",
    { parse_mode: "Markdown", reply_markup: kb }
  );
}

async function doExport(ctx, format, filters = null) {
  if (!adminGuard(ctx)) return;
  const statusMsg = await ctx.reply("⏳ Mengekspor...");
  try {
    const file = service.exportAccounts({ format, filters });
    await ctx.api.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
    await ctx.replyWithDocument(new InputFile(file), {
      caption: `📤 Export (${format.toUpperCase()})`,
      reply_markup: inventorySectionKeyboard(),
    });
  } catch (e) {
    await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, "❌ Export gagal: " + e.message);
  }
}

// ─── Bulk Actions ────────────────────────────────────────────────────────────
async function showBulk(ctx) {
  if (!adminGuard(ctx)) return;
  await ctx.reply(
    "🔁 *BULK ACTIONS*\n\n" +
    "Pilih baris via search, lalu gunakan command:\n" +
    "`/invbulk delete 1,2,3`\n" +
    "`/invbulk disable 1,2,3`\n" +
    "`/invbulk enable 1,2,3`\n" +
    "`/invbulk status SOLD 1,2,3`\n" +
    "`/invbulk move 'New Product' 1,2,3`",
    { parse_mode: "Markdown", reply_markup: inventorySectionKeyboard() }
  );
}

async function runBulk(ctx, action, ids, statusOrProduct) {
  if (!adminGuard(ctx)) return;
  const idList = ids.map((x) => parseInt(x, 10)).filter((n) => !isNaN(n));
  if (!idList.length) {
    await ctx.reply("❌ Tidak ada ID valid.");
    return;
  }
  let res;
  if (action === "status") {
    res = service.bulkChangeStatus({ ids: idList, status: statusOrProduct, adminUserId: ctx.from.id });
  } else if (action === "move") {
    res = service.bulkAction({ ids: idList, action: "move_product", targetProduct: statusOrProduct, adminUserId: ctx.from.id });
  } else {
    res = service.bulkAction({ ids: idList, action, adminUserId: ctx.from.id });
  }
  await ctx.reply(
    `✅ Bulk *${action}*: ${res.affected} baris diproses.`,
    { parse_mode: "Markdown", reply_markup: inventorySectionKeyboard() }
  );
}

module.exports = {
  isAdmin,
  adminGuard,
  showAdminMenu,
  showDashboard,
  showProducts,
  showStats,
  showHistory,
  showDuplicates,
  sendTemplate,
  beginUpload,
  handleUpload,
  processImport,
  showSearch,
  runSearch,
  showExport,
  doExport,
  showBulk,
  runBulk,
  pendingUploads,
};
