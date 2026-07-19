const { Bot, InlineKeyboard } = require("grammy");
const config = require("./lib/config");
const providers = require("./lib/providers");
const helpers = require("./lib/telegram-helpers");
const tiktok = require("./lib/tiktok");
const inventory = require("./lib/inventory/admin");
const invDb = require("./lib/inventory/db");
const payment = require("./lib/payment/xendit");
const paymentStore = require("./lib/payment/store");
const paymentServer = require("./lib/payment/server");

// ─── Per-user session settings (in-memory) ───────────────────────────────────
const userSettings = new Map();

// Cache daftar produk untuk menu beli akun (per user)
const buyMenuCache = new Map();

// State untuk flow top up manual: userId -> { amount }
const topupRequests = new Map();

// answerCallbackQuery that never throws (ignores expired/invalid query errors)
async function safeAnswer(ctx, text) {
  try {
    if (text) await safeAnswer(ctx, text);
    else await safeAnswer(ctx);
  } catch (e) {
    // query too old / invalid — safe to ignore
  }
}

function getUserSettings(userId) {
  if (!userSettings.has(userId)) {
    userSettings.set(userId, {
      provider: config.defaultProvider,
      model: config.PROVIDERS[config.defaultProvider].defaultModel,
      ratio: config.defaultAspectRatio,
      duration: config.defaultDuration,
      resolution: config.defaultResolution,
      motion: config.defaultMotion,
      generateAudio: config.generateAudio,
    });
  }
  return userSettings.get(userId);
}

// ─── Bot Instance ────────────────────────────────────────────────────────────
const bot = new Bot(config.telegramToken);

// ─── Price List ───────────────────────────────────────────────────────────────
const PRICE_LIST = [
  { id: "kling_pro", name: "Kling Motion Control 3.0 Pro", price: "8rb" },
  { id: "kling_std", name: "Kling Motion Control 3.0 STD", price: "5rb" },
  { id: "kling_26_pro", name: "Kling Motion Control 2.6 Pro", price: "4rb" },
  { id: "kling_26_std", name: "Kling Motion Control 2.6 STD", price: "2rb" },
  { id: "kling_fhd", name: "Kling Video 3.0 Full HD 15s", price: "6rb" },
  { id: "grock3", name: "Grock 3.0 720P 10s", price: "2rb", provider: "kie", model: "grok-imagine/text-to-video" },
  { id: "grock4", name: "Grock 4.0 720P 15s", price: "4rb", provider: "pollinations", model: "grok-video-pro" },
  { id: "veo31", name: "Veo 3.1 Fast", price: "2rb", provider: "pollinations", model: "veo" },
];

const PRICE_LIST_KEYBOARD = new InlineKeyboard();
for (const item of PRICE_LIST) {
  const label = item.provider ? `${item.name} (${item.price})` : `🔜 ${item.name} (${item.price})`;
  PRICE_LIST_KEYBOARD.text(label, `pilih_model:${item.id}`);
  PRICE_LIST_KEYBOARD.row();
}
PRICE_LIST_KEYBOARD.text("⬅️ Kembali", "menu:main");

// ─── Main Menu ───────────────────────────────────────────────────────────────
function mainMenuKeyboard() {
  return new InlineKeyboard()
    .text("🎬 Buat Video", "menu:video")
    .text("🖼️ Buat Gambar", "menu:image")
    .row()
    .text("🔑 Beli Akun", "menu:akun")
    .text("💳 Top Up", "menu:topup");
}

const PROVIDER_EMOJIS = {
  byteplus: "🔷",
  kling: "🟣",
  hailuo: "🟢",
  luma: "🔵",
  runway: "🟠",
  veo: "🟤",
  leonardo: "⚪",
  ernie: "🔴",
  replicate: "🟡",
  runninghub: "🔶",
  freetheai: "🆓",
  kie: "💜",
  pollinations: "🌸",
};

async function showMainMenu(ctx, text = null) {
  const name = ctx.from?.first_name || "User";
  const s = getUserSettings(ctx.from.id);
  const providerInfo = config.PROVIDERS[s.provider];
  const emoji = PROVIDER_EMOJIS[s.provider] || "🤖";

  const msg = text || (
    `┌─────────────────────┐\n` +
    `│   🎬 *AI VIDEO*     │\n` +
    `│   *GENERATOR* 🚀    │\n` +
    `└─────────────────────┘\n\n` +
    `👋 Halo *${name}*!\n\n` +
    `📡 *Status:* ${emoji} ${providerInfo.name}\n` +
    `🤖 \`${s.model}\`\n` +
    `📐 \`${s.ratio}\` 🖥️ \`${s.resolution || "720p"}\` ⏱ \`${s.duration === "auto" ? "Auto" : s.duration + "s"}\`\n\n` +
    `👇 Pilih menu:`
  );

  await ctx.reply(msg, {
    parse_mode: "Markdown",
    reply_markup: mainMenuKeyboard(),
  });
}

async function showPriceList(ctx) {
  const lines = PRICE_LIST.map(i =>
    i.provider ? `• ${i.name} (${i.price})` : `• 🔜 ${i.name} (${i.price})`
  ).join("\n");

  await ctx.reply(
    `┌────────────────────────────────────┐\n` +
    `│       📋 *LIST HARGA VIDEO*        │\n` +
    `└────────────────────────────────────┘\n\n` +
    `${lines}\n\n` +
    `🔜 = Coming Soon\n` +
    `👇 Klik model untuk memulai:`,
    { parse_mode: "Markdown", reply_markup: PRICE_LIST_KEYBOARD }
  );
}

async function showPlaceholder(ctx, title, body) {
  const keyboard = new InlineKeyboard().text("⬅️ Kembali", "menu:main");
  await ctx.reply(
    `┌─────────────────────┐\n` +
    `│   ${title}           │\n` +
    `└─────────────────────┘\n\n` +
    body,
    { parse_mode: "Markdown", reply_markup: keyboard }
  );
}

// ─── /start Command ──────────────────────────────────────────────────────────
bot.command("start", async (ctx) => {
  await showMainMenu(ctx);
});

// ─── Main Menu Callback Handler ────────────────────────────────────────────
bot.callbackQuery(/^menu:(.+)$/, async (ctx) => {
  const action = ctx.match[1];
  await safeAnswer(ctx);

  switch (action) {
    case "generate":
      const genS = getUserSettings(ctx.from.id);
      const genP = config.PROVIDERS[genS.provider];
      const genEmoji = PROVIDER_EMOJIS[genS.provider] || "🤖";
      const genIsImg = genS.provider === "ernie";
      if (genP.usable === false) {
        await ctx.reply(
          `❌ *${genP.name}* tidak bisa digunakan.\n\n${genP.statusNote}\n\n` +
          `💜 Silakan ganti provider lewat menu *Model* atau ketik \`/model kie\``,
          { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🤖 Pilih Model", "menu:model").text("🏠 Menu", "menu:main") }
        );
        break;
      }
      await ctx.reply(
        `╭━━━━━━━━━━━━━━━━━━━━━╮\n` +
        `┃   🎬 *GENERATE*     ┃\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
        `${genEmoji} *${genP.name}* aktif\n` +
        `📐 \`${genS.ratio}\` 🖥️ \`${genS.resolution || "720p"}\` ⏱ \`${genS.duration === "auto" ? "Auto" : genS.duration + "s"}\` 🎬 *${genS.motion === "none" ? "❌" : genS.motion}*\n\n` +
        `📝 *Ketik prompt untuk ${genIsImg ? "gambar" : "video"}:*\n\n` +
        `Contoh:\n` +
        `\`/generate A golden retriever running on the beach, cinematic\``,
        { parse_mode: "Markdown" }
      );
      break;
    case "video":
      await showPriceList(ctx);
      break;
    case "image":
      await showPlaceholder(ctx, "🖼️ *IMAGE GEN*",
        `Fitur image generation masih dalam pengembangan.\n\n` +
        `🔜 Nanti bisa bikin gambar pake:\n` +
        `• KIE Grok Imagine\n` +
        `• Pollinations AI\n\n` +
        `Sementara ini, fokus ke *Buat Video* dulu ya! 🎬`
      );
      break;
    case "akun":
      await showBuyMenu(ctx);
      break;
    case "topup":
      await showManualTopUp(ctx);
      break;
    case "settings":
      await showSettings(ctx);
      break;
    case "model":
      await showModelPicker(ctx);
      break;
    case "ratio":
      await showRatioPicker(ctx);
      break;
    case "resolution":
      await showResolutionPicker(ctx);
      break;
    case "duration":
      await showDurationPicker(ctx);
      break;
    case "main":
      await showMainMenu(ctx);
      return;
    case "motion":
      await showMotionPicker(ctx);
      break;
    case "help":
      const statusList = Object.entries(config.PROVIDERS)
        .map(([key, p]) => `${PROVIDER_EMOJIS[key] || "🤖"} ${p.usable ? "✅" : "❌"} ${p.name}`)
        .join("\n");
      await ctx.reply(
        `📖 *Panduan Lengkap*\n\n` +
        `🎬 *Generate Video:*\n` +
        `Ketik \`/generate <prompt>\` atau klik *Generate Video* di menu\n\n` +
        `🖼 *Image-to-Video:*\n` +
        `Kirim foto dengan caption/prompt (pilih KIE + I2V model)\n\n` +
        `⚙️ *Pengaturan:*\n` +
        `Gunakan menu untuk ganti model, ratio, resolusi, durasi, motion\n\n` +
        `🎬 *Motion Control:* pan, zoom, tilt, orbit\n\n` +
        `📡 *Status Provider:*\n${statusList}`,
        { parse_mode: "Markdown" }
      );
      break;
  }
});

// ─── Model Selection Callback Handler ───────────────────────────────────────
bot.callbackQuery(/^pilih_model:(.+)$/, async (ctx) => {
  const id = ctx.match[1];
  await safeAnswer(ctx);

  const item = PRICE_LIST.find(i => i.id === id);
  if (!item) {
    await ctx.reply("❌ Model tidak dikenal.", { reply_markup: new InlineKeyboard().text("⬅️ Kembali", "menu:video") });
    return;
  }

  if (!item.provider) {
    await ctx.reply(
      `🔜 *${item.name}*\n\n` +
      `Fitur ini masih dalam pengembangan. Coming soon!\n\n` +
      `Sementara itu, coba model yang sudah tersedia:\n` +
      `• 💜 *Grock 3.0* (KIE.ai — gratis 80 credit)\n` +
      `• 🌸 *Veo 3.1 Fast* (Pollinations AI)\n\n` +
      `👇 Klik model di bawah atau pilih di menu *Buat Video*.`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🎬 Buat Video", "menu:video").text("🏠 Menu", "menu:main") }
    );
    return;
  }

  const s = getUserSettings(ctx.from.id);
  s.provider = item.provider;
  s.model = item.model;
  const p = config.PROVIDERS[item.provider];
  const emoji = PROVIDER_EMOJIS[item.provider] || "🤖";

  await ctx.reply(
    `✅ *${item.name}* dipilih!\n\n` +
    `${emoji} *${p.name}*\n` +
    `🤖 \`${item.model}\`\n\n` +
    `📝 *Ketik prompt untuk video:*\n\n` +
    `Contoh: \`/generate Cinematic drone shot over a tropical island, 4K, slow motion\`\n\n` +
    `🖼 Atau kirim *foto dengan caption* untuk Image-to-Video (khusus KIE).`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🏠 Menu", "menu:main") }
  );
});

// ─── Shared functions ──────────────────────────────────────────────────────
async function showSettings(ctx) {
  const s = getUserSettings(ctx.from.id);
  const providerInfo = config.PROVIDERS[s.provider];
  const emoji = PROVIDER_EMOJIS[s.provider] || "🤖";

  const keyboard = new InlineKeyboard()
    .text("🤖 Ganti Model", "menu:model")
    .text("🎬 Motion", "menu:motion")
    .row()
    .text("📐 Ganti Ratio", "menu:ratio")
    .text("⏱ Ganti Durasi", "menu:duration")
    .row()
    .text("🖥️ Ganti Resolusi", "menu:resolution")
    .row()
    .text("🏠 Main Menu", "menu:main");

  await ctx.reply(
    `╭━━━━━━━━━━━━━━━━━━━━━╮\n` +
    `┃   ⚙️ *SETTINGS*     ┃\n` +
    `╰━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
    `${emoji} *Platform:* ${providerInfo.name}\n` +
    `├ 🤖 *Model:* \`${s.model}\`\n` +
    `├ 📐 *Ratio:* \`${s.ratio}\`\n` +
    `├ 🖥️ *Res:* \`${s.resolution || "720p"}\`\n` +
    `├ ⏱ *Durasi:* \`${s.duration === "auto" ? "Auto" : s.duration + " detik"}\`\n` +
    `├ 🎬 *Motion:* ${s.motion === "none" ? "❌ Off" : `\`${s.motion}\``}\n` +
    `└ 🔊 *Audio:* ${s.generateAudio ? "✅ Nyala" : "❌ Mati"}\n`,
    { parse_mode: "Markdown", reply_markup: keyboard }
  );
}

async function showModelPicker(ctx) {
  const s = getUserSettings(ctx.from.id);
  const activeKey = s.provider;

  function providerBtn(key) {
    const p = config.PROVIDERS[key];
    const emoji = PROVIDER_EMOJIS[key] || "🤖";
    const disabled = p.usable === false ? " ❌" : "";
    const label = activeKey === key ? `${emoji} ✅ ${p.name}` : `${emoji}${disabled} ${p.name}`;
    return { text: label, data: `set_provider:${key}` };
  }

  const keyboard = new InlineKeyboard();
  for (const [key, p] of Object.entries(config.PROVIDERS)) {
    if (p.usable === false) continue;
    keyboard.text(providerBtn(key).text, providerBtn(key).data).row();
  }
  keyboard.text("🏠 Main Menu", "menu:main");

  await ctx.reply(
    `╭━━━━━━━━━━━━━━━━━━━━━╮\n` +
    `┃   🤖 *PILIH MODEL*   ┃\n` +
    `╰━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
    `📌 *Aktif:* ${PROVIDER_EMOJIS[activeKey] || ""} *${config.PROVIDERS[activeKey].name}*\n` +
    (config.PROVIDERS[activeKey].usable === false ? `⚠️ *Catatan:* ${config.PROVIDERS[activeKey].statusNote}\n` : "") +
    `\n✅ = siap pakai  |  ❌ = sedang bermasalah\n` +
    `👇 Klik untuk berganti:`,
    { parse_mode: "Markdown", reply_markup: keyboard }
  );
}

async function showModelDetail(ctx, providerKey) {
  const p = config.PROVIDERS[providerKey];
  const emoji = PROVIDER_EMOJIS[providerKey] || "🤖";
  const s = getUserSettings(ctx.from.id);
  const activeModel = s.model;
  const models = Object.values(p.models);

  const keyboard = new InlineKeyboard();
  for (const model of models) {
    const isActive = model === activeModel;
    keyboard.text(isActive ? `✅ ${model}` : model, `set_model:${providerKey}:${model}`);
    keyboard.row();
  }
  keyboard.text("🔙 Back", "menu:model").text("🏠 Main Menu", "menu:main");

  await ctx.reply(
    `${emoji} *${p.name}*\n\n` +
    `📋 *Pilih Model:*\n` +
    models.map(m => (m === activeModel ? `✅ \`${m}\` *(active)*` : `• \`${m}\``)).join("\n") +
    `\n\n👇 Klik untuk memilih model:`,
    { parse_mode: "Markdown", reply_markup: keyboard }
  );
}

async function showRatioPicker(ctx) {
  const s = getUserSettings(ctx.from.id);
  function ratioBtn(r) {
    return { text: r === s.ratio ? `✅ ${r}` : r, data: `set_ratio:${r}` };
  }
  const keyboard = new InlineKeyboard()
    .text(ratioBtn("16:9").text, ratioBtn("16:9").data)
    .text(ratioBtn("9:16").text, ratioBtn("9:16").data)
    .row()
    .text(ratioBtn("1:1").text, ratioBtn("1:1").data)
    .text(ratioBtn("21:9").text, ratioBtn("21:9").data)
    .row()
    .text(ratioBtn("4:3").text, ratioBtn("4:3").data)
    .text(ratioBtn("3:4").text, ratioBtn("3:4").data)
    .row()
    .text("🏠 Main Menu", "menu:main");

  await ctx.reply(
    `📐 *Pengaturan Aspect Ratio*\n\n` +
    `Saat ini: \`${s.ratio}\`\n\n` +
    `👇 Pilih ratio:`,
    { parse_mode: "Markdown", reply_markup: keyboard }
  );
}

async function showResolutionPicker(ctx) {
  const s = getUserSettings(ctx.from.id);
  const current = s.resolution || "720p";
  function resBtn(r) {
    const label = { "480p": "480p (Standard)", "720p": "720p (HD)", "1080p": "1080p (FHD)", "4k": "4k (UHD)" }[r] || r;
    return { text: r === current ? `✅ ${label}` : label, data: `set_resolution:${r}` };
  }
  const keyboard = new InlineKeyboard()
    .text(resBtn("480p").text, resBtn("480p").data)
    .text(resBtn("720p").text, resBtn("720p").data)
    .row()
    .text(resBtn("1080p").text, resBtn("1080p").data)
    .text(resBtn("4k").text, resBtn("4k").data)
    .row()
    .text("🏠 Main Menu", "menu:main");

  await ctx.reply(
    `🖥️ *Pengaturan Resolusi*\n\n` +
    `Saat ini: \`${current}\`\n\n` +
    `👇 Pilih resolusi:`,
    { parse_mode: "Markdown", reply_markup: keyboard }
  );
}

async function showDurationPicker(ctx) {
  const s = getUserSettings(ctx.from.id);
  const current = s.duration;
  function durBtn(d) {
    const label = d === "auto" ? "⏩ Auto" : `${d} Detik`;
    return { text: d === current ? `✅ ${label}` : label, data: `set_duration:${d}` };
  }
  const keyboard = new InlineKeyboard()
    .text(durBtn("auto").text, durBtn("auto").data)
    .text(durBtn("5").text, durBtn("5").data)
    .row()
    .text(durBtn("8").text, durBtn("8").data)
    .text(durBtn("10").text, durBtn("10").data)
    .row()
    .text(durBtn("15").text, durBtn("15").data)
    .row()
    .text("🏠 Main Menu", "menu:main");

  await ctx.reply(
    `⏱ *Pengaturan Durasi*\n\n` +
    `Saat ini: \`${current === "auto" ? "Auto" : current + " detik"}\`\n\n` +
    `👇 Pilih durasi:`,
    { parse_mode: "Markdown", reply_markup: keyboard }
  );
}

async function showMotionPicker(ctx) {
  const s = getUserSettings(ctx.from.id);
  const current = s.motion;

  const keyboard = new InlineKeyboard();
  for (const m of config.MOTION_OPTIONS) {
    const label = m === "none" ? "❌ None" : `🎬 ${m}`;
    keyboard.text(m === current ? `✅ ${label}` : label, `set_motion:${m}`);
    keyboard.row();
  }
  keyboard.text("🏠 Main Menu", "menu:main");

  await ctx.reply(
    `🎬 *AI Motion Control*\n\n` +
    `Saat ini: ${current === "none" ? "❌ Off" : `\`${current}\``}\n\n` +
    `👇 Pilih gerakan kamera:`,
    { parse_mode: "Markdown", reply_markup: keyboard }
  );
}

// ─── /settings Command ──────────────────────────────────────────────────────
bot.command("settings", async (ctx) => {
  await showSettings(ctx);
});

// ─── /model Command ──────────────────────────────────────────────────────────
bot.command("model", async (ctx) => {
  const arg = ctx.match?.trim().toLowerCase();

  if (arg && config.PROVIDERS[arg]) {
    const p = config.PROVIDERS[arg];

    if (p.usable === false) {
      const emoji = PROVIDER_EMOJIS[arg] || "🤖";
      await ctx.reply(
        `❌ *${p.name}* tidak bisa digunakan\n\n` +
        `${p.statusNote}\n\n` +
        `💜 Silakan gunakan *KIE.ai* yang sudah siap pakai.`,
        { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("💜 Pilih KIE", "set_provider:kie").text("🏠 Menu", "menu:main") }
      );
      return;
    }

    const s = getUserSettings(ctx.from.id);
    s.provider = arg;
    s.model = p.defaultModel;

    const emoji = PROVIDER_EMOJIS[arg] || "🤖";
    await ctx.reply(
      `╭━━━━━━━━━━━━━━━━━━━━━╮\n` +
      `┃   ✅ *BERHASIL*     ┃\n` +
      `╰━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
      `${emoji} *${p.name}*\n` +
      `🤖 \`${s.model}\``,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🏠 Main Menu", "menu:main") }
    );
    return;
  }

  await showModelPicker(ctx);
});

// ─── /ratio Command ──────────────────────────────────────────────────────────
bot.command("ratio", async (ctx) => {
  const arg = ctx.match?.trim();

  if (arg && config.ASPECT_RATIOS.includes(arg)) {
    const s = getUserSettings(ctx.from.id);
    s.ratio = arg;
    const keyboard = new InlineKeyboard().text("🏠 Main Menu", "menu:main");
    await ctx.reply(`✅ Aspect ratio diubah ke *${arg}*`, { parse_mode: "Markdown", reply_markup: keyboard });
    return;
  }

  await showRatioPicker(ctx);
});

// ─── /resolution Command ─────────────────────────────────────────────────────
bot.command(["resolution", "res"], async (ctx) => {
  const arg = ctx.match?.trim().toLowerCase();

  if (arg && config.RESOLUTIONS.includes(arg)) {
    const s = getUserSettings(ctx.from.id);
    s.resolution = arg;
    const keyboard = new InlineKeyboard().text("🏠 Main Menu", "menu:main");
    await ctx.reply(`✅ Resolusi video diubah ke *${arg}*`, { parse_mode: "Markdown", reply_markup: keyboard });
    return;
  }

  await showResolutionPicker(ctx);
});

// ─── /motion Command ────────────────────────────────────────────────────────
bot.command("motion", async (ctx) => {
  const arg = ctx.match?.trim().toLowerCase();

  if (arg && config.MOTION_OPTIONS.includes(arg)) {
    const s = getUserSettings(ctx.from.id);
    s.motion = arg;
    const label = arg === "none" ? "❌ Off" : `🎬 ${arg}`;
    const keyboard = new InlineKeyboard().text("🏠 Main Menu", "menu:main");
    await ctx.reply(`✅ Motion diubah ke *${label}*`, { parse_mode: "Markdown", reply_markup: keyboard });
    return;
  }

  await showMotionPicker(ctx);
});

// ─── /duration Command ───────────────────────────────────────────────────────
bot.command("duration", async (ctx) => {
  const arg = ctx.match?.trim().toLowerCase();

  if (arg && config.DURATIONS.includes(arg)) {
    const s = getUserSettings(ctx.from.id);
    s.duration = arg;
    const label = arg === "auto" ? "Auto" : arg + " detik";
    const keyboard = new InlineKeyboard().text("🏠 Main Menu", "menu:main");
    await ctx.reply(`✅ Durasi diubah ke *${label}*`, { parse_mode: "Markdown", reply_markup: keyboard });
    return;
  }

  await showDurationPicker(ctx);
});

// ─── /help Command ──────────────────────────────────────────────────────────
bot.command("help", async (ctx) => {
  await showMainMenu(ctx);
});

// ─── /menu Command ──────────────────────────────────────────────────────────
bot.command("menu", async (ctx) => {
  await showMainMenu(ctx);
});

// ─── /credits Command ───────────────────────────────────────────────────────
bot.command("credits", async (ctx) => {
  const keyboard = new InlineKeyboard()
    .url("🔗 Buka KIE Logs", "https://kie.ai/logs")
    .url("🌸 Pollinations Balance", "https://enter.pollinations.ai")
    .text("🏠 Menu", "menu:main");
  await ctx.reply(
    `💳 *Cek Credit*\n\n` +
    `🔹 *KIE.ai*: Buka https://kie.ai/logs (login)\n` +
    `🔹 *Pollinations*: Buka https://enter.pollinations.ai\n\n` +
    `📌 *KIE* punya 80 credits gratis (≈8 video).\n` +
    `📌 *Pollinations* dapet 1.5 Pollen/minggu gratis.\n\n` +
    `👇 Klik link di bawah:`,
    { parse_mode: "Markdown", reply_markup: keyboard }
  );
});

// ─── /tiktok Command ────────────────────────────────────────────────────────
bot.command("tiktok", async (ctx) => {
  const input = (ctx.match || "").trim();
  if (!input) {
    await ctx.reply(
      `🎬 *TikTok Affiliator*\n\n` +
      `Generate script + caption + hashtag buat promosi produk di TikTok.\n\n` +
      `📝 *Cara pakai:*\n` +
      `\`/tiktok <nama produk>\`\n\n` +
      `Contoh:\n` +
      `\`/tiktok serum vitamin c glowing\`\n` +
      `\`/tiktok earphone bluetooth murah\`\n\n` +
      `💡 Kategori auto-detect (skincare, fashion, electronics, food, fitness, home)`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🏠 Menu", "menu:main") }
    );
    return;
  }

  const category = tiktok.detectCategory(input);
  const content = tiktok.generateTikTokContent(input, category);
  const safeProduct = input.replace(/[_*`]/g, " ");

  const msg =
    `🎬 *TIKTOK AFFILIATOR*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📦 *Produk:* ${safeProduct}\n` +
    `📂 *Kategori:* ${category || "umum"}\n\n` +
    `${content.script}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📝 *CAPTION:*\n${content.caption}\n\n` +
    `🔖 ${content.hashtags.join(" ")}\n\n` +
    `${content.thumbnail}\n\n` +
    `🔗 *Jangan lupa tempelin link afiliasi di bio!*\n` +
    `🎥 Mau bikin videonya juga? Ketik \`/generate ${safeProduct}\``;

  await ctx.reply(msg, {
    parse_mode: "Markdown",
    reply_markup: new InlineKeyboard().text("🎥 Bikin Video", `menu:video`).text("🏠 Menu", "menu:main"),
  });
});

// ─── Admin Panel: Bulk Account Inventory ────────────────────────────────────
bot.command("myid", async (ctx) => {
  const id = ctx.from?.id;
  const isAdmin = inventory.isAdmin(ctx);
  const envAdmins = (process.env.ADMIN_USER_IDS || "(kosong)").slice(0, 200);
  const hasKey = process.env.INVENTORY_ENCRYPTION_KEY ? "✅ ter-set" : "❌ kosong";
  await ctx.reply(
    `🆔 *Telegram User ID:* \`${id}\`\n\n` +
    `Status admin: ${isAdmin ? "✅ Sudah terdaftar" : "❌ Belum terdaftar"}\n\n` +
    `🔧 ADMIN_USER_IDS (env): \`${envAdmins}\`\n` +
    `🔑 INVENTORY_ENCRYPTION_KEY: ${hasKey}\n\n` +
    (isAdmin ? "" : `Daftarkan ID ini ke variabel \`ADMIN_USER_IDS\` di Railway Variables, lalu redeploy.`),
    { parse_mode: "Markdown" }
  );
});

bot.command("admin", async (ctx) => {
  await inventory.showAdminMenu(ctx);
});

bot.command("invsearch", async (ctx) => {
  const raw = ctx.match?.trim() || "";
  const filters = {};
  for (const part of raw.split(/\s+/).filter(Boolean)) {
    const [k, ...v] = part.split("=");
    if (k && v.length) filters[k] = v.join("=").trim();
  }
  await inventory.runSearch(ctx, filters, 1);
});

bot.command("invbulk", async (ctx) => {
  const raw = ctx.match?.trim() || "";
  const [action, ...rest] = raw.split(/\s+/);
  if (!action) {
    await inventory.showBulk(ctx);
    return;
  }
  if (action === "status") {
    const status = rest[0];
    const ids = rest.slice(1).join("").split(",").filter(Boolean);
    await inventory.runBulk(ctx, "status", ids, status);
  } else if (action === "move") {
    const idsPart = rest[rest.length - 1];
    const product = rest.slice(0, -1).join(" ").replace(/^"|"$/g, "");
    await inventory.runBulk(ctx, "move", idsPart.split(",").filter(Boolean), product);
  } else {
    const ids = rest.join("").split(",").filter(Boolean);
    await inventory.runBulk(ctx, action, ids);
  }
});

// ─── Credit Commands ─────────────────────────────────────────────────────────
bot.command("credit", async (ctx) => {
  const bal = inventory.getCredit(ctx.from.id);
  await ctx.reply(
    `💳 *SALDO KREDIT*\n\n` +
    `👤 User: ${ctx.from?.first_name || ctx.from.id}\n` +
    `💰 Saldo: *${bal} kredit*\n\n` +
    `Gunakan kredit untuk beli akun di menu 🔑 Beli Akun.\n` +
    `Top up via admin: hubungi untuk isi saldo.`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🛒 Beli Akun", "menu:akun").text("🏠 Menu", "menu:main") }
  );
});

bot.command("addcredit", async (ctx) => {
  if (!inventory.isAdmin(ctx)) {
    await ctx.reply("⛔ Akses ditolak.");
    return;
  }
  const raw = (ctx.match || "").trim();
  const [target, amountStr] = raw.split(/\s+/);
  const amount = parseInt(amountStr, 10);
  if (!target || isNaN(amount) || amount <= 0) {
    await ctx.reply("❌ Format: `/addcredit <user_id> <jumlah>`\nContoh: `/addcredit 5241655508 100`", { parse_mode: "Markdown" });
    return;
  }
  try {
    const newBal = inventory.addCredit(target, amount, { adminUserId: String(ctx.from.id) });
    await ctx.reply(`✅ Kredit ditambah!\n\nUser: \`${target}\`\nJumlah: +${amount}\nSaldo baru: *${newBal}*`, { parse_mode: "Markdown" });
  } catch (e) {
    await ctx.reply("❌ Gagal: " + e.message.replace(/[_*`]/g, ""));
  }
});

bot.command("delacc", async (ctx) => {
  if (!inventory.isAdmin(ctx)) {
    await ctx.reply("⛔ Akses ditolak.");
    return;
  }
  const email = (ctx.match || "").trim();
  if (!email) {
    await ctx.reply("❌ Format: `/delacc <email>`", { parse_mode: "Markdown" });
    return;
  }
  try {
    const db = invDb.getDb();
    db.run("DELETE FROM accounts WHERE lower(email)=?", [email.toLowerCase()]);
    invDb.flush();
    await ctx.reply("🗑 Akun dihapus: `" + email + "`", { parse_mode: "Markdown" });
  } catch (e) {
    await ctx.reply("❌ " + e.message.replace(/[_*`]/g, ""));
  }
});

bot.command("addacc", async (ctx) => {
  if (!inventory.isAdmin(ctx)) {
    await ctx.reply("⛔ Akses ditolak.");
    return;
  }
  // /addacc <email>|<password>|<product_name>|<price>|<status>
  // pakai pipe "|" agar product name bisa mengandung spasi
  const raw = (ctx.match || "").trim();
  const parts = raw.split("|").map((s) => s.trim());
  const email = parts[0];
  const password = parts[1];
  const product = parts[2] || "Leonardo AI";
  const price = parts[3] || "";
  const status = (parts[4] || "AVAILABLE").toUpperCase();
  if (!email || !password) {
    await ctx.reply("❌ Format: `/addacc <email>|<password>|<product>|<price>|<status>`\nContoh: `/addacc user@gmail.com|pass123|Leonardo AI|8|AVAILABLE`", { parse_mode: "Markdown" });
    return;
  }
  try {
    const db = invDb.getDb();
    const enc = invDb.encrypt(password);
    db.run(
      "INSERT INTO accounts (product_name,email,password,status,price,created_at,updated_at) VALUES (?,?,?,?,?,datetime('now'),datetime('now'))",
      [product, email, enc, status, price || null]
    );
    invDb.flush();
    await ctx.reply(`✅ Akun ditambah:\n\`${email}\`\nProduk: ${product}\nStatus: ${status}\nPrice: ${price || "-"}`, { parse_mode: "Markdown" });
  } catch (e) {
    await ctx.reply("❌ " + e.message.replace(/[_*`]/g, ""));
  }
});

bot.command("invdb", async (ctx) => {
  if (!inventory.isAdmin(ctx)) {
    await ctx.reply("⛔ Akses ditolak.");
    return;
  }
  try {
    const db = invDb.getDb();
    const rows = db.exec(
      "SELECT product_name, status, COUNT(*) c FROM accounts GROUP BY product_name, status ORDER BY product_name, status"
    );
    const lines = rows.length
      ? rows[0].values.map((r) => `• \`${r[0]}\` | ${r[1]} | ${r[2]}`).join("\n")
      : "_(kosong - belum ada akun)_";
    const hist = db.exec(
      "SELECT id, filename, imported, skipped, duplicates, invalid_email, invalid_product, failed_rows, created_at FROM import_history ORDER BY id DESC LIMIT 5"
    );
    const histLines = hist.length
      ? hist[0].values
          .map((h) => `• #${h[0]} ${h[1]}: +${h[2]} | skip ${h[3]} | dup ${h[4]} | invalidE ${h[5]} | invalidP ${h[6]} | failed ${h[7]}`)
          .join("\n")
      : "_(belum ada history import)_";
    await ctx.reply(
      `🗄 *DB INVENTORY DEBUG*\n\n` +
      `ALLOWED: \`${config.ALLOWED_ACCOUNT_PRODUCTS.join(", ") || "(semua)"}\`\n\n` +
      `Akun per produk/status:\n${lines}\n\n` +
      `🕑 *Import History (5 terakhir):*\n${histLines}`,
      { parse_mode: "Markdown" }
    );
  } catch (e) {
    await ctx.reply("❌ " + e.message.replace(/[_*`]/g, ""));
  }
});

bot.command("topupcredit", async (ctx) => {
  const raw = (ctx.match || "").trim();
  const amount = parseInt(raw, 10);
  if (!amount || amount <= 0) {
    await ctx.reply("❌ Format: `/topupcredit <jumlah>`\nContoh: `/topupcredit 100`", { parse_mode: "Markdown" });
    return;
  }
  inventory.ensureUser(ctx.from.id, { username: ctx.from?.username, first_name: ctx.from?.first_name });
  await ctx.reply(
    `📥 *PERMINTAAN TOP UP*\n\n` +
    `User: \`${ctx.from.id}\`\nJumlah: ${amount} kredit\n\n` +
    `Permintaan dikirim ke admin. Setelah dikonfirmasi, saldo akan bertambah.`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🏠 Menu", "menu:main") }
  );
  // notify admins
  const admins = (process.env.ADMIN_USER_IDS || "").split(",").map((x) => x.trim()).filter(Boolean);
  for (const a of admins) {
    try {
      await ctx.api.sendMessage(a,
        `🔔 *Permintaan Top Up Kredit*\nUser: \`${ctx.from.id}\` (${ctx.from?.first_name || ""})\nJumlah: ${amount}\n\nApprove: \`/addcredit ${ctx.from.id} ${amount}\``,
        { parse_mode: "Markdown" });
    } catch {}
  }
});

// ─── /gencost (Cek saldo & biaya generate) ───────────────────────────────────
bot.command("gencost", async (ctx) => {
  const userId = ctx.from.id;
  inventory.ensureUser(userId, { username: ctx.from?.username, first_name: ctx.from?.first_name });
  const bal = inventory.getCredit(userId);
  const cost = parseInt(config.LEONARDO_CREDIT_COST || "2000", 10);
  const canGen = bal >= cost
    ? "✅ Bisa generate *" + Math.floor(bal / cost) + "x*"
    : "❌ Kurang *" + (cost - bal) + "* kredit lagi";
  await ctx.reply(
    "💡 *INFO GENERATE LEONARDO AI*\n\n" +
    "👤 User: `" + userId + "`\n" +
    "💰 Saldo: *" + bal + " kredit*\n" +
    "💸 Biaya per generate: *" + cost + " kredit*\n" +
    "📊 Status: " + canGen + "\n\n" +
    "Top up saldo: `/pay 100`\nCek saldo: `/credits`",
    { parse_mode: "Markdown" }
  );
});

// ─── Manual Top Up (while Xendit verification pending) ───────────────────────
function manualPaymentText() {
  const mp = config.MANUAL_PAYMENT;
  const rate = mp.ratePerCredit || 1000;
  let lines = "";
  for (const m of mp.methods) {
    lines += "• *" + m.name + "*: `" + m.number + "`\n";
  }
  return (
    "💳 *TOP UP MANUAL*\n\n" +
    "Rate: *1 kredit = Rp " + rate.toLocaleString("id-ID") + "*\n\n" +
    "*Cara bayar:*\n" + lines + "\n" +
    "📞 Admin: `" + mp.adminContact + "`\n" +
    "📝 " + mp.note + "\n\n" +
    "Pilih nominal di bawah, lalu kirim *bukti transfer* (screenshot). Admin akan konfirmasi manual."
  );
}

async function showManualTopUp(ctx) {
  const mp = config.MANUAL_PAYMENT;
  const rate = mp.ratePerCredit || 1000;
  const text = manualPaymentText();
  const kb = new InlineKeyboard();
  const nom = [100, 300, 500, 1000, 2000];
  for (const n of nom) {
    kb.text("💰 " + n + " (" + (n * rate / 1000) + "k)", "topup_pick:" + n).row();
  }
  kb.text("🏠 Menu", "menu:main");
  await ctx.reply(text, { parse_mode: "Markdown", reply_markup: kb });
}

// ─── /pay (Top up via Xendit) ────────────────────────────────────────────────
// ─── Top Up Manual: pilih nominal ──────────────────────────────────────────
bot.callbackQuery(/^topup_pick:(\d+)$/, async (ctx) => {
  await safeAnswer(ctx);
  const amount = parseInt(ctx.match[1], 10);
  if (!amount || amount <= 0) return;
  topupRequests.set(ctx.from.id, { amount });
  const rate = config.MANUAL_PAYMENT.ratePerCredit || 1000;
  const total = amount * rate;
  await ctx.editMessageText(
    "📤 *KIRIM BUKTI TRANSFER*\n\n" +
    "1. Transfer ke rekening admin (lihat menu Top Up).\n" +
    "2. Kirim screenshot bukti transfer ke chat ini.\n\n" +
    "Nominal: *" + amount + " kredit* = *Rp " + total.toLocaleString("id-ID") + "*\n\n" +
    "Admin akan cek & konfirmasi saldo dalam maks 1 jam.",
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🏠 Menu", "menu:main") }
  );
});

bot.command("pay", async (ctx) => {
  const raw = (ctx.match || "").trim();
  // Support init data dari Mini App: /pay <jumlah> <web_app_init_data>
  let creditAmount;
  let webAppInitData = null;
  const parts = raw.split(/\s+/);
  if (parts.length >= 1) creditAmount = parseInt(parts[0], 10);
  if (parts.length >= 2 && parts[1].startsWith("xnd_public_development_")) {
    webAppInitData = parts[1];
  }
  if (!creditAmount || creditAmount <= 0) {
    await ctx.reply(
      "💳 *TOP UP OTOMATIS (Xendit)*\n\n" +
      "Format: `/pay <jumlah_kredit>`\nContoh: `/pay 100`\n\n" +
      "Anda akan dapat link pembayaran (QRIS/VA). Setelah bayar, kredit masuk otomatis.",
      { parse_mode: "Markdown" }
    );
    return;
  }

  if (!payment.isConfigured()) {
    await ctx.reply("⚠️ Payment gateway belum dikonfigurasi. Hubungi admin untuk top up manual (`/topupcredit`).");
    return;
  }

  const rate = parseInt(process.env.CREDIT_RATE_IDR || "1000", 10); // 1 credit = Rp1000
  const amountIdr = creditAmount * rate;

  inventory.ensureUser(ctx.from.id, { username: ctx.from?.username, first_name: ctx.from?.first_name });

  inventory.ensureUser(ctx.from.id, { username: ctx.from?.username, first_name: ctx.from?.first_name });
  const statusMsg = await ctx.reply("⏳ Membuat invoice pembayaran...");
  try {
    const inv = await payment.createInvoice({
      amount: amountIdr,
      description: `Top up ${creditAmount} kredit`,
      payerEmail: ctx.from?.username ? `${ctx.from.username}@telegram.local` : undefined,
      metadata: { user_id: String(ctx.from.id), credit_amount: creditAmount, web_app_init_data: webAppInitData || undefined },
    });
    paymentStore.createPayment({
      userId: ctx.from.id,
      invoiceId: inv.id,
      externalId: inv.externalId,
      amount: amountIdr,
      creditAmount,
      metadata: { user_id: String(ctx.from.id), web_app_init_data: webAppInitData || undefined },
    });
    await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id,
      `💳 *INVOICE DIBUAT*\n\n` +
      `Kredit: *${creditAmount}*\n` +
      `Total: Rp ${amountIdr.toLocaleString("id-ID")}\n\n` +
      `👇 Klik link untuk bayar (QRIS / VA / E-Wallet):`,
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().url("💳 Bayar Sekarang", inv.invoiceUrl).text("🏠 Menu", "menu:main"),
      }
    );
  } catch (e) {
    console.error("[pay] create invoice failed:", e);
    await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id,
      "❌ Gagal membuat invoice: " + e.message.replace(/[_*`]/g, ""));
  }
});

// ─── /generate Command ──────────────────────────────────────────────────────
bot.command("generate", async (ctx) => {
  const prompt = ctx.match?.trim();

  if (!prompt) {
    const s = getUserSettings(ctx.from.id);
    const p = config.PROVIDERS[s.provider];
    const emoji = PROVIDER_EMOJIS[s.provider] || "🤖";
    const isImgProvider = s.provider === "ernie";

    if (p.usable === false) {
      await ctx.reply(
        `❌ *${p.name}* tidak bisa digunakan.\n\n${p.statusNote}\n\n` +
        `💜 Ketik \`/model kie\` untuk pake KIE.ai yang siap pakai.`,
        { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("💜 Pilih KIE", "set_provider:kie").text("🏠 Menu", "menu:main") }
      );
      return;
    }

    const isI2V = s.model?.includes("image-to-video");
    const modeLabel = isImgProvider ? "Text-to-Image" : (isI2V ? "Image-to-Video" : "Text-to-Video");
    const keyboard = new InlineKeyboard()
      .text("✍️ Ketik Prompt", "menu:generate")
      .text("🏠 Main Menu", "menu:main");
    await ctx.reply(
      `╭━━━━━━━━━━━━━━━━━━━━━╮\n` +
      `┃   🎬 *GENERATE*     ┃\n` +
      `╰━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
    `${emoji} *${p.name}*\n` +
    `🤖 \`${s.model}\` — *${modeLabel}*\n` +
    `📐 \`${s.ratio}\` 🖥️ \`${s.resolution || "720p"}\` ⏱ \`${s.duration === "auto" ? "Auto" : s.duration + "s"}\` 🎬 *${s.motion === "none" ? "❌" : s.motion}*\n\n` +
    (isI2V ? `🖼 *Kirim foto dengan caption sebagai prompt*` : `📝 *Tulis prompt untuk ${isImgProvider ? "gambar" : "video"}:*`) +
    `\n\nContoh:\n` +
    `\`/generate Cinematic drone shot of a tropical island at sunset, 4K, slow motion\``,
      { parse_mode: "Markdown", reply_markup: keyboard }
    );
    return;
  }

  await handleVideoGeneration(ctx, prompt, null);
});

// ─── Photo with Caption Handler (Image-to-Video) ────────────────────────────
bot.on("message:photo", async (ctx) => {
  const caption = ctx.message.caption?.trim();

  // Top Up Manual: foto = bukti transfer, bukan prompt generate
  const pending = topupRequests.get(ctx.from.id);
  if (pending) {
    topupRequests.delete(ctx.from.id);
    const amount = pending.amount;
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const admins = (process.env.ADMIN_USER_IDS || "").split(",").map((x) => x.trim()).filter(Boolean);
    const note = caption ? "\n📝 Catatan: " + caption : "";
    for (const a of admins) {
      try {
        await ctx.api.sendPhoto(a, photo.file_id, {
          caption:
            "💳 *BUKTI TOP UP MANUAL*\nUser: `" + ctx.from.id + "` (" + (ctx.from?.first_name || "") + ")\n" +
            "Jumlah: *" + amount + " kredit*\n" + note + "\n\nApprove: `/addcredit " + ctx.from.id + " " + amount + "`",
          parse_mode: "Markdown",
        });
      } catch (e) {}
    }
    await ctx.reply(
      "✅ *Bukti transfer diterima!*\n\nAdmin akan verifikasi & menambah *" + amount + " kredit* ke saldo Anda dalam maks 1 jam.\nTerima kasih!",
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🏠 Menu", "menu:main") }
    );
    return;
  }

  if (!caption) {
    await ctx.reply(
      `🖼 *Gambar diterima!*\n\n` +
        `Untuk generate video dari gambar ini, kirim ulang dengan *caption* berisi deskripsi/prompt.\n\n` +
        `Contoh caption:\n` +
        `_"Zoom out slowly revealing a beautiful landscape, cinematic"_`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  let statusMsg;
  try {
    statusMsg = await ctx.reply("📥 Mengunduh gambar referensi...");
    const imageBase64 = await helpers.getPhotoAsBase64(ctx);
    await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, "📥 Gambar diterima! Memulai proses...");
    await handleVideoGeneration(ctx, caption, imageBase64, statusMsg);
  } catch (err) {
    console.error("Photo processing error:", err);
    const errorText = `❌ Gagal memproses gambar: ${err.message}`;
    if (statusMsg) {
      await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, errorText);
    } else {
      await ctx.reply(errorText);
    }
  }
});

// ─── Helper: Progress Bar ───────────────────────────────────────────────────
function getProgressBar(percent, length = 10) {
  const filled = Math.round((percent / 100) * length);
  return "█".repeat(filled) + "░".repeat(length - filled);
}

// ─── Core Video Generation Handler ──────────────────────────────────────────
async function handleVideoGeneration(ctx, prompt, imageBase64 = null, existingStatusMsg = null) {
  const userId = ctx.from.id;
  const s = getUserSettings(userId);
  const providerKey = s.provider;
  const providerInfo = config.PROVIDERS[providerKey];

  let statusMsg = existingStatusMsg;

  if (providerInfo.usable === false) {
    const errMsg = `❌ *${providerInfo.name}* tidak bisa digunakan.\n\n${providerInfo.statusNote}\n\nSilakan ganti provider lewat menu *Model*.`;
    if (statusMsg) {
      await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, errMsg, { parse_mode: "Markdown" });
    } else {
      await ctx.reply(errMsg, { parse_mode: "Markdown" });
    }
    return;
  }

  // ─── Leonardo AI: reserve account + check credit ─────────────────────────
  let leonardoApiKey = null;
  const LEONARDO_COST = parseInt(config.LEONARDO_CREDIT_COST || "2000", 10);
  if (providerKey === "leonardo") {
    const bal = inventory.getCredit(userId);
    if (bal < LEONARDO_COST) {
      const msg = `❌ *Saldo tidak cukup!*\n\nUntuk generate Leonardo AI butuh *${LEONARDO_COST} kredit*, saldo kamu: *${bal}*.\nTop up dulu via /pay.`;
      if (statusMsg) await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, msg, { parse_mode: "Markdown" });
      else await ctx.reply(msg, { parse_mode: "Markdown" });
      return;
    }
    const leo = inventory.reserveLeonardoAccount("Leonardo AI");
    if (!leo) {
      const msg = `❌ *Stok akun Leonardo habis!*\n\nHubungi admin untuk restock akun Leonardo AI.`;
      if (statusMsg) await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, msg, { parse_mode: "Markdown" });
      else await ctx.reply(msg, { parse_mode: "Markdown" });
      return;
    }
    leonardoApiKey = leo.apiKey;
  }

  // Send initial status
  const isImageProvider = providerKey === "ernie";
  const modeText = isImageProvider ? "✍️ Text-to-Image" : (imageBase64 ? "🖼 Image-to-Video" : "✍️ Text-to-Video");
  const genLabel = isImageProvider ? "Gambar" : "Video";

  const ps = (n) => prompt.substring(0, n).replace(/[_*`\[\]()]/g, "");

  const startingText = `⏳ *Memulai Generate ${genLabel}...*\n\n` +
    `🔌 Platform: *${providerInfo.name}*\n` +
    `🤖 Model: \`${s.model}\`\n` +
    `📝 Prompt: ${ps(100)}${prompt.length > 100 ? "..." : ""}\n\n` +
    `🔄 Mengirim ke API...`;

  if (!statusMsg) {
    statusMsg = await ctx.reply(startingText, { parse_mode: "Markdown" });
  } else {
    await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, startingText, { parse_mode: "Markdown" });
  }

  // Submit task to selected provider
  const submitResult = await providers.submitTask(providerKey, prompt, imageBase64, {
    model: s.model,
    ratio: s.ratio,
    resolution: s.resolution || "720p",
    duration: s.duration,
    motion: s.motion,
    generateAudio: s.generateAudio,
    apiKey: leonardoApiKey,
  });

  if (!submitResult.success) {
    const errSafe = submitResult.error.replace(/[_*`]/g, "");
    // Rollback reserved account so it can be reused
    if (providerKey === "leonardo" && leonardoApiKey) {
      try {
        const invDb = require("./lib/inventory/db");
        const db = invDb.getDb();
        db.run("UPDATE accounts SET status='AVAILABLE', order_id=NULL, telegram_user_id=NULL, updated_at=datetime('now') WHERE status='IN_USE' AND api_key IS NOT NULL");
        invDb.flush();
      } catch (e) {}
    }
    await ctx.api.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      `❌ *Gagal submit task!*\n\n` +
        `🔌 Platform: *${providerInfo.name}*\n` +
        `Error: ${errSafe}`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  const taskId = submitResult.taskId;

  // Deduct fixed credit for Leonardo AI generation
  if (providerKey === "leonardo" && leonardoApiKey) {
    inventory.deductCredit(userId, LEONARDO_COST);
  }

  // Update status: submitted
  try {
    await ctx.api.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      `✅ *Task berhasil di-submit!*\n\n` +
        `🔌 Platform: *${providerInfo.name}*\n` +
        `🆔 Task ID: \`${taskId}\`\n` +
        `📝 Prompt: ${ps(80)}${prompt.length > 80 ? "..." : ""}\n\n` +
        `⏳ Menunggu proses selesai... (max 10 menit)\n` +
        `🔄 Status: *Queued*`,
      { parse_mode: "Markdown" }
    );
  } catch (e) {
    console.error("editMsg submit success FAILED:", e.message);
  }

  // Poll for completion with status updates
  let lastEditedStatus = "queued";
  let progressDots = 0;

  const result = await providers.waitForCompletion(providerKey, taskId, async (status, resultData, elapsed) => {
    const statusChanged = status !== lastEditedStatus;
    if (statusChanged) {
      lastEditedStatus = status;
    }

    const statusEmoji = {
      queued: "⏳ *Queued*",
      running: "🔄 *Running*",
    };

    const statusText = statusEmoji[status] || `❓ Status: ${status}`;
    const elapsedSec = Math.floor(elapsed / 1000);
    const elapsedMin = Math.floor(elapsedSec / 60);
    const elapsedStr = elapsedMin > 0 ? `${elapsedMin}m ${elapsedSec % 60}s` : `${elapsedSec}s`;

    progressDots = (progressDots + 1) % 20;
    const dots = ".".repeat(Math.min(progressDots + 1, 5)).padEnd(5, " ");

    let progressLine = "";
    if (resultData?.progress !== undefined && resultData.progress !== null) {
      progressLine = `\n📊 Progress: *${resultData.progress}%* ${getProgressBar(resultData.progress, 10)}`;
    }
    if (resultData?.previewUrl && status === "running") {
      progressLine += `\n🖼️ *Preview tersedia*`;
    }

    try {
      await ctx.api.editMessageText(
        ctx.chat.id,
        statusMsg.message_id,
        `${isImageProvider ? "🖼 *Generating Image...*" : "🎬 *Generating Video...*"} ${dots}\n\n` +
          `🔌 Platform: *${providerInfo.name}*\n` +
          `🤖 Model: \`${s.model}\`\n` +
          `🆔 Task: \`${taskId.slice(0, 12)}...\`\n` +
          `⏱️ *${elapsedStr}* ${progressLine}\n\n` +
          `${statusText} — ${status === "queued" ? "Menunggu giliran" : "AI sedang memproses video"}...\n` +
          `_Mohon tunggu..._`,
        { parse_mode: "Markdown" }
      );
    } catch {
      // Ignore edit errors (e.g. message not modified)
    }
  });

  // Handle result
  if (result.success) {
    const isImage = providerKey === "ernie";
    const mediaLabel = isImage ? "Gambar" : "Video";

    await ctx.api.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      `✅ *${mediaLabel} Berhasil Di-generate!*\n\n` +
        `🔌 Platform: *${providerInfo.name}*\n` +
        `🆔 Task ID: \`${taskId}\`\n\n` +
        `📥 Mengirim ${mediaLabel.toLowerCase()} ke chat...`,
      { parse_mode: "Markdown" }
    );

    const caption =
      isImage
        ? `🖼 *AI Generated Image*\n\n` +
          `🔌 Platform: *${providerInfo.name}*\n` +
          `📝 ${ps(150)}${prompt.length > 150 ? "..." : ""}`
        : `🎬 *AI Generated Video*\n\n` +
          `🔌 Platform: *${providerInfo.name}*\n` +
          `📝 ${ps(150)}${prompt.length > 150 ? "..." : ""}`;

    if (isImage) {
      const buffer = Buffer.from(result.videoUrl.split(",")[1], "base64");
      await ctx.replyWithPhoto(buffer, { caption, parse_mode: "Markdown" });
    } else {
      await helpers.sendVideoFromUrl(ctx, result.videoUrl, caption);
    }

    // Final status update
    const finalMsg = isImage
      ? `✅ *Selesai!*\n\n` +
        `🔌 Platform: *${providerInfo.name}*\n` +
        `🆔 Task ID: \`${taskId}\`\n` +
        `📝 Prompt: ${ps(80)}${prompt.length > 80 ? "..." : ""}\n\n` +
        `🖼️ Gambar telah terkirim!`
      : `✅ *Selesai!*\n\n` +
        `🔌 Platform: *${providerInfo.name}*\n` +
        `🆔 Task ID: \`${taskId}\`\n` +
        `📝 Prompt: ${ps(80)}${prompt.length > 80 ? "..." : ""}\n\n` +
        `✨ Video telah terkirim!`;

    await ctx.api.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      finalMsg,
      { parse_mode: "Markdown" }
    );
  } else {
    await ctx.api.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      `❌ *Generate Video Gagal*\n\n` +
        `🔌 Platform: *${providerInfo.name}*\n` +
        `🆔 Task ID: \`${taskId}\`\n\n` +
        `Error: ${(result.error || "").replace(/[_*`]/g, "")}\n\n` +
        `_Silakan coba lagi atau ubah prompt Anda._`,
      { parse_mode: "Markdown" }
    );
  }
}

// ─── Callback Query Handlers ─────────────────────────────────────────────────
bot.callbackQuery(/^set_provider:(.+)$/, async (ctx) => {
  const targetProvider = ctx.match[1];
  if (!config.PROVIDERS[targetProvider]) {
    await safeAnswer(ctx, "Platform tidak dikenal.");
    return;
  }

  const p = config.PROVIDERS[targetProvider];

  if (p.usable === false) {
    await safeAnswer(ctx, "❌ Tidak bisa dipakai");
    await ctx.reply(
      `❌ *${p.name}* tidak bisa digunakan\n\n` +
      `${p.statusNote}\n\n` +
      `💜 Silakan gunakan *KIE.ai* yang sudah siap pakai.`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("💜 Pilih KIE", "set_provider:kie").text("🏠 Menu", "menu:main") }
    );
    return;
  }

  const s = getUserSettings(ctx.from.id);
  s.provider = targetProvider;
  s.model = p.defaultModel;

  const emoji = PROVIDER_EMOJIS[targetProvider] || "🤖";
  await safeAnswer(ctx, `${p.name} dipilih!`);
  await showModelDetail(ctx, targetProvider);
});

bot.callbackQuery(/^set_model:(.+):(.+)$/, async (ctx) => {
  const providerKey = ctx.match[1];
  const model = ctx.match[2];
  const s = getUserSettings(ctx.from.id);
  s.provider = providerKey;
  s.model = model;

  const p = config.PROVIDERS[providerKey];
  const emoji = PROVIDER_EMOJIS[providerKey] || "🤖";
  await safeAnswer(ctx, `Model: ${model}`);
  await ctx.editMessageText(
    `╭━━━━━━━━━━━━━━━━━━━━━╮\n` +
    `┃   ✅ *BERHASIL*     ┃\n` +
    `╰━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
    `${emoji} *${p.name}*\n` +
    `🤖 Model: \`${model}\``,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🏠 Main Menu", "menu:main") }
  );
});

bot.callbackQuery(/^set_ratio:(.+)$/, async (ctx) => {
  const targetRatio = ctx.match[1];
  if (!config.ASPECT_RATIOS.includes(targetRatio)) {
    await safeAnswer(ctx, "Ratio tidak valid.");
    return;
  }

  const s = getUserSettings(ctx.from.id);
  s.ratio = targetRatio;

  await safeAnswer(ctx, `Ratio: ${targetRatio}`);
  await ctx.editMessageText(
    `✅ *Ratio Diubah*\n\n📐 \`${targetRatio}\``,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🏠 Main Menu", "menu:main") }
  );
});

bot.callbackQuery(/^set_resolution:(.+)$/, async (ctx) => {
  const targetRes = ctx.match[1];
  if (!config.RESOLUTIONS.includes(targetRes)) {
    await safeAnswer(ctx, "Resolusi tidak valid.");
    return;
  }

  const s = getUserSettings(ctx.from.id);
  s.resolution = targetRes;

  await safeAnswer(ctx, `Resolusi: ${targetRes}`);
  await ctx.editMessageText(
    `✅ *Resolusi Diubah*\n\n🖥️ \`${targetRes}\``,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🏠 Main Menu", "menu:main") }
  );
});

bot.callbackQuery(/^set_duration:(.+)$/, async (ctx) => {
  const targetDuration = ctx.match[1];
  if (!config.DURATIONS.includes(targetDuration)) {
    await safeAnswer(ctx, "Durasi tidak valid.");
    return;
  }

  const s = getUserSettings(ctx.from.id);
  s.duration = targetDuration;

  const durationLabel = targetDuration === "auto" ? "Auto" : `${targetDuration} detik`;
  await safeAnswer(ctx, `Durasi: ${durationLabel}`);
  await ctx.editMessageText(
    `✅ *Durasi Diubah*\n\n⏱️ \`${durationLabel}\``,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🏠 Main Menu", "menu:main") }
  );
});

bot.callbackQuery(/^set_motion:(.+)$/, async (ctx) => {
  const targetMotion = ctx.match[1];
  if (!config.MOTION_OPTIONS.includes(targetMotion)) {
    await safeAnswer(ctx, "Motion tidak valid.");
    return;
  }

  const s = getUserSettings(ctx.from.id);
  s.motion = targetMotion;

  const label = targetMotion === "none" ? "❌ Off" : `🎬 ${targetMotion}`;
  await safeAnswer(ctx, `Motion: ${label}`);
  await ctx.editMessageText(
    `✅ *Motion Diubah*\n\n🎬 \`${label}\``,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🏠 Main Menu", "menu:main") }
  );
});

// ─── Inventory Admin: Callback Handlers ──────────────────────────────────────
bot.callbackQuery(/^inv:(.+)$/, async (ctx) => {
  const action = ctx.match[1];
  await safeAnswer(ctx);
  if (!inventory.isAdmin(ctx)) {
    await ctx.reply("⛔ Akses ditolak.");
    return;
  }

  try {
    switch (action) {
      case "menu": return inventory.showAdminMenu(ctx);
      case "dashboard": return inventory.showDashboard(ctx);
      case "products": return inventory.showProducts(ctx);
      case "stats": return inventory.showStats(ctx);
      case "history": return inventory.showHistory(ctx);
      case "duplicates": return inventory.showDuplicates(ctx);
      case "template": return inventory.sendTemplate(ctx);
      case "upload_csv": return inventory.beginUpload(ctx, "csv");
      case "upload_xlsx": return inventory.beginUpload(ctx, "excel");
      case "search": return inventory.showSearch(ctx);
      case "export": return inventory.showExport(ctx);
      case "bulk": return inventory.showBulk(ctx);
      case "dup_skip": return inventory.processImport(ctx, "skip");
      case "dup_replace": return inventory.processImport(ctx, "replace");
      case "dup_cancel": return inventory.processImport(ctx, "cancel");
      case "export_csv": return inventory.doExport(ctx, "csv");
      case "export_xlsx": return inventory.doExport(ctx, "excel");
      case "export_avail": return inventory.doExport(ctx, "csv", { status: "AVAILABLE" });
      default:
        if (action.startsWith("filter:")) {
          const status = action.split(":")[1];
          return inventory.runSearch(ctx, { status }, 1);
        }
    }
  } catch (e) {
    console.error("[inventory] callback error:", e);
    ctx.reply("❌ Error: " + (e.message || "unknown").replace(/[_*`]/g, "")).catch(() => {});
  }
});

// ─── Buy Account Callbacks ───────────────────────────────────────────────────
bot.callbackQuery(/^buy:(\d+)$/, async (ctx) => {
  await safeAnswer(ctx);
  await showProductDetail(ctx, parseInt(ctx.match[1], 10));
});

bot.callbackQuery(/^buyconfirm:(\d+)$/, async (ctx) => {
  await safeAnswer(ctx);
  await handleBuy(ctx, parseInt(ctx.match[1], 10));
});

bot.callbackQuery("buymenu", async (ctx) => {
  await safeAnswer(ctx);
  await showBuyMenu(ctx);
});

bot.callbackQuery(/^payneeded:(\d+)$/, async (ctx) => {
  await safeAnswer(ctx);
  const needed = parseInt(ctx.match[1], 10);
  if (!payment.isConfigured()) {
    await ctx.reply("⚠️ Payment gateway belum dikonfigurasi. Gunakan `/topupcredit " + needed + "` untuk minta top up manual.");
    return;
  }
  const rate = parseInt(process.env.CREDIT_RATE_IDR || "1000", 10);
  const amountIdr = needed * rate;
  const webAppInitData = ctx.webAppInitData || null;
  const statusMsg = await ctx.reply("⏳ Membuat invoice pembayaran...");
  try {
    const inv = await payment.createInvoice({
      amount: amountIdr,
      description: `Top up ${needed} kredit`,
      metadata: { user_id: String(ctx.from.id), credit_amount: needed, web_app_init_data: webAppInitData || undefined },
    });
    paymentStore.createPayment({
      userId: ctx.from.id, invoiceId: inv.id, externalId: inv.externalId,
      amount: amountIdr, creditAmount: needed, metadata: { user_id: String(ctx.from.id), web_app_init_data: webAppInitData || undefined },
    });
    await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id,
      `💳 *INVOICE DIBUAT*\n\nKredit: *${needed}*\nTotal: Rp ${amountIdr.toLocaleString("id-ID")}\n\n👇 Bayar sekarang:`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().url("💳 Bayar Sekarang", inv.invoiceUrl).text("🏠 Menu", "menu:main") });
  } catch (e) {
    await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, "❌ Gagal membuat invoice: " + e.message.replace(/[_*`]/g, ""));
  }
});

// ─── Inventory Admin: Document Upload Handler ────────────────────────────────
bot.on("message:document", async (ctx) => {
  const pending = inventory.pendingUploads.get(ctx.from?.id);
  if (!pending || pending.stage !== "await_file") {
    // Guide admin if they send a file outside the upload flow
    if (inventory.isAdmin(ctx)) {
      await ctx.reply(
        "📎 File diterima tapi bukan dalam sesi upload.\n" +
        "Ketik `/admin` → 📥 Upload CSV / Upload Excel, lalu kirim file kembali.",
        { parse_mode: "Markdown" }
      );
    }
    return; // not an inventory upload
  }
  try {
    await inventory.handleUpload(ctx);
  } catch (e) {
    console.error("[inventory] document upload fatal:", e);
    await ctx.reply("❌ Upload gagal: " + (e.message || "unknown").replace(/[_*`]/g, "").substring(0, 200)).catch(() => {});
  }
});

// ─── Buy Account (from inventory DB) ─────────────────────────────────────────
function formatRupiah(credits) {
  const rate = config.MANUAL_PAYMENT.ratePerCredit || 1000;
  const rupiah = Math.round((credits || 0) * rate);
  return "Rp " + rupiah.toLocaleString("id-ID");
}

async function showBuyMenu(ctx) {
  let products;
  try {
    products = inventory.getProductsWithStock();
  } catch (e) {
    console.error("[buy] getProductsWithStock failed:", e.message);
    await ctx.reply("⚠️ Gagal memuat daftar akun. Coba lagi nanti.");
    return;
  }

  if (!products.length) {
    await ctx.reply(
      "🛒 *BELI AKUN*\n\nBelum ada produk tersedia saat ini.\nSilakan cek kembali nanti atau hubungi admin.",
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🏠 Menu", "menu:main") }
    );
    return;
  }

  const kb = new InlineKeyboard();
  products.forEach((p, i) => {
    const label = p.price ? `${p.product_name} (${p.available}) • ${formatRupiah(p.price)}` : `${p.product_name} (${p.available})`;
    kb.text(label, `buy:${i}`).row();
  });
  kb.text("🏠 Menu", "menu:main");

  // store product list in ctx session for lookup by index
  buyMenuCache.set(ctx.from.id, products);

  await ctx.reply(
    "🛒 *BELI AKUN DIGITAL*\n\n" +
    "Pilih produk di bawah. Stok = akun AVAILABLE siap kirim otomatis.\n\n" +
    products.map((p) => `• ${p.product_name}: ${p.available} tersedia${p.price ? ` • ${p.price}` : ""}`).join("\n"),
    { parse_mode: "Markdown", reply_markup: kb }
  );
}

async function showProductDetail(ctx, index) {
  const products = buyMenuCache.get(ctx.from.id) || [];
  const p = products[index];
  if (!p) {
    await ctx.reply("❌ Produk tidak ditemukan. Kembali ke menu.", { reply_markup: new InlineKeyboard().text("🏠 Menu", "menu:main") });
    return;
  }
  const kb = new InlineKeyboard()
    .text("✅ Beli Sekarang", `buyconfirm:${index}`)
    .row()
    .text("⬅️ Kembali", "buymenu")
    .text("🏠 Menu", "menu:main");

  await ctx.reply(
    `🛒 *${p.product_name}*\n\n` +
    `📦 Stok tersedia: *${p.available}*\n` +
      (p.price ? `💰 Harga: *${formatRupiah(p.price)}*\n` : "") +
    `💡 Akun akan dikirim otomatis setelah konfirmasi.\n\n` +
    `_Catatan: fitur ini mengambil akun langsung dari inventory admin._`,
    { parse_mode: "Markdown", reply_markup: kb }
  );
}

async function handleBuy(ctx, index) {
  const products = buyMenuCache.get(ctx.from.id) || [];
  const p = products[index];
  if (!p) {
    await ctx.reply("❌ Produk tidak ditemukan.");
    return;
  }

  const statusMsg = await ctx.reply("⏳ Memproses pembelian & mengecek saldo kredit...");
  try {
    const result = inventory.purchaseWithCredit(p.product_name, {
      telegramUserId: String(ctx.from.id),
      username: ctx.from?.username,
      first_name: ctx.from?.first_name,
      price: p.price,
    });

    if (!result.success) {
      let msg;
      if (result.reason === "OUT_OF_STOCK") {
        msg = `❌ Maaf, stok *${p.product_name}* habis. Silakan pilih produk lain.`;
      } else if (result.reason === "INSUFFICIENT_CREDIT") {
        const neededCredit = Math.max(result.needed, 0);
        const kb = new InlineKeyboard();
        if (payment.isConfigured()) {
          kb.text(`💳 Top Up ${neededCredit} Kredit`, `payneeded:${neededCredit}`).row();
        }
        kb.text("⬅️ Kembali", "buymenu").text("🏠 Menu", "menu:main");
        await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id,
          `❌ *Kredit tidak cukup!*\n\n` +
          `Produk: *${p.product_name}*\n` +
          `Harga: ${formatRupiah(result.needed)}\n` +
          `Saldo Anda: ${result.have}\n\n` +
          `Top up dulu untuk lanjut.`,
          { parse_mode: "Markdown", reply_markup: kb });
        return;
      } else {
        msg = `❌ Gagal memproses pembelian.`;
      }
      await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, msg,
        { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("⬅️ Kembali", "buymenu") });
      return;
    }

    const acc = result.account;
    const caption =
      `✅ *AKUN BERHASIL DIBELI*\n\n` +
      `📦 Produk: *${acc.product_name}*\n` +
      (result.price ? `💰 Harga: ${formatRupiah(result.price)}\n` : "") +
      (result.balance != null ? `💳 Sisa saldo: ${result.balance} kredit\n` : "") +
      `📧 Email: \`${acc.email}\`\n` +
      `🔑 Password: \`${acc.password}\`\n` +
      (acc.recovery_email ? `📧 Recovery: \`${acc.recovery_email}\`\n` : "") +
      (acc.recovery_password ? `🔑 Rec. Password: \`${acc.recovery_password}\`\n` : "") +
      (acc.profile_name ? `👤 Profile: ${acc.profile_name}\n` : "") +
      (acc.notes ? `📝 Notes: ${acc.notes}\n` : "") +
      `\n🔒 Simpan baik-baik kredensial Anda.`;

    await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, "✅ Pembayaran berhasil! Mengirim kredensial...");
    await ctx.reply(caption, {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard().text("🏠 Menu", "menu:main"),
    });
    // Notify admins if stock of any product dropped below threshold
    inventory.notifyLowStock(ctx.api).catch(() => {});
  } catch (e) {
    console.error("[buy] purchase failed:", e);
    await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id,
      "❌ Gagal memproses pembelian: " + (e.message || "unknown").replace(/[_*`]/g, ""),
      { reply_markup: new InlineKeyboard().text("⬅️ Kembali", "buymenu") });
  }
}

// ─── Fallback: Unknown text messages ─────────────────────────────────────────
bot.on("message:text", async (ctx) => {
  if (ctx.message.text.startsWith("/")) return;

  await showMainMenu(ctx, `💡 Maaf, saya tidak mengerti "${ctx.message.text.substring(0, 30)}"\n\nGunakan menu di bawah:`);
});

// ─── Error Handler ───────────────────────────────────────────────────────────
bot.catch((err) => {
  const ctx = err.ctx;
  const e = err.error;
  // Ignore benign "callback query too old / invalid" errors — happens when user
  // clicks an inline button after Telegram's ~3s window expired. Not a real failure.
  const msg = e && (e.description || e.message || "");
  if (/query is too old|callback query.*invalid|response timeout expired/i.test(msg)) {
    console.warn("Ignored expired callback query error");
    return;
  }
  const detail = (e && (e.stack || e.message)) ? (e.stack || e.message) : String(e || err);
  console.error(`Error while handling update ${ctx?.update?.update_id}:`);
  console.error(detail);
  const safe = String(detail).replace(/[_*`]/g, "").split("\n").slice(0, 2).join(" | ").substring(0, 250);
  if (ctx) ctx.reply("⚠️ Error: " + safe).catch(() => {});
});

// ─── Start Bot ───────────────────────────────────────────────────────────────
async function setupBot() {
  await bot.api.setMyCommands([
    { command: "start", description: "🚀 Main Menu" },
    { command: "generate", description: "🎬 Generate video dari prompt" },
    { command: "model", description: "🤖 Ganti platform AI" },
    { command: "ratio", description: "📐 Set aspect ratio" },
    { command: "motion", description: "🎬 Set gerakan kamera (AI Motion Control)" },
    { command: "resolution", description: "🖥️ Set resolusi video" },
    { command: "duration", description: "⏱ Set durasi video" },
    { command: "settings", description: "⚙️ Lihat pengaturan" },
    { command: "help", description: "❓ Bantuan" },
    { command: "myid", description: "🆔 Tampilkan Telegram User ID Anda" },
    { command: "admin", description: "🛠️ Admin Panel (inventory akun)" },
    { command: "invsearch", description: "🔍 Cari akun inventory" },
    { command: "invbulk", description: "🔁 Bulk action akun (delete/disable/status/move)" },
    { command: "credit", description: "💳 Cek saldo kredit" },
    { command: "delacc", description: "🗑 Hapus akun by email (admin)" },
    { command: "topupcredit", description: "📥 Minta top up kredit" },
    { command: "pay", description: "💳 Top up kredit otomatis (Xendit)" },
    { command: "gencost", description: "💡 Cek biaya & sisa generate Leonardo" },
  ]);
}

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("🎬 AI Video Generator Bot (Multi-Model)");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("🚀 Starting bot...\n");

function startPaymentServer() {
  if (!payment.isConfigured()) {
    console.log("💳 Payment gateway: TIDAK dikonfigurasi (XENDIT_API_KEY / XENDIT_WEBHOOK_TOKEN kosong). Fitur /pay nonaktif.");
    return;
  }
  const app = paymentServer.createServer(bot.api);
  const port = parseInt(process.env.PORT || "3000", 10);
  app.listen(port, () => {
    console.log(`💳 Payment webhook server listening on port ${port} (${payment.isConfigured() ? "Xendit" : ""})`);
  });
}

setupBot()
  .then(() => invDb.init())
  .then(() => bot.start())
  .then(() => startPaymentServer())
  .catch(() => bot.start());
