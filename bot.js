const { Bot, InlineKeyboard } = require("grammy");
const config = require("./lib/config");
const providers = require("./lib/providers");
const helpers = require("./lib/telegram-helpers");
const tiktok = require("./lib/tiktok");
const inventory = require("./lib/inventory/admin");
const invDb = require("./lib/inventory/db");

// ─── Per-user session settings (in-memory) ───────────────────────────────────
const userSettings = new Map();

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
  await ctx.answerCallbackQuery();

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
      await showPlaceholder(ctx, "🔑 *BELI AKUN*",
        `Mau beli akun Leonardo AI atau provider lain?\n\n` +
        `📞 *Kontak Admin:*\n` +
        `Hubungi via WhatsApp untuk info harga & stok.\n\n` +
        `🔜 Fitur ini masih dalam pengembangan.`
      );
      break;
    case "topup":
      await showPlaceholder(ctx, "💳 *TOP UP*",
        `Mau isi saldo?\n\n` +
        `💜 *KIE.ai*: 80 credits gratis (≈8 video)\n` +
        `🌸 *Pollinations*: 1.5 Pollen/minggu gratis\n\n` +
        `📞 *Top Up via Admin:* Hubungi WhatsApp.\n\n` +
        `Atau daftar sendiri:\n` +
        `• KIE: https://kie.ai/logs\n` +
        `• Pollinations: https://enter.pollinations.ai`
      );
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
  await ctx.answerCallbackQuery();

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

  const keyboard = new InlineKeyboard()
    .text(providerBtn("kie").text, providerBtn("kie").data)
    .text(providerBtn("byteplus").text, providerBtn("byteplus").data)
    .row()
    .text(providerBtn("replicate").text, providerBtn("replicate").data)
    .text(providerBtn("runninghub").text, providerBtn("runninghub").data)
    .row()
    .text(providerBtn("freetheai").text, providerBtn("freetheai").data)
    .text(providerBtn("pollinations").text, providerBtn("pollinations").data)
    .row()
    .text(providerBtn("kling").text, providerBtn("kling").data)
    .row()
    .text(providerBtn("hailuo").text, providerBtn("hailuo").data)
    .text(providerBtn("luma").text, providerBtn("luma").data)
    .row()
    .text(providerBtn("runway").text, providerBtn("runway").data)
    .text(providerBtn("veo").text, providerBtn("veo").data)
    .row()
    .text(providerBtn("leonardo").text, providerBtn("leonardo").data)
    .text(providerBtn("ernie").text, providerBtn("ernie").data)
    .row()
    .text("🏠 Main Menu", "menu:main");

  await ctx.reply(
    `╭━━━━━━━━━━━━━━━━━━━━━╮\n` +
    `┃   🤖 *PILIH MODEL*   ┃\n` +
    `╰━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
    `📌 *Aktif:* ${PROVIDER_EMOJIS[activeKey] || ""} *${config.PROVIDERS[activeKey].name}*\n` +
    (config.PROVIDERS[activeKey].usable === false ? `⚠️ *Catatan:* ${config.PROVIDERS[activeKey].statusNote}\n` : "") +
    `\n💜 KIE = siap pakai  |  ❌ = sedang bermasalah\n` +
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
  });

  if (!submitResult.success) {
    const errSafe = submitResult.error.replace(/[_*`]/g, "");
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
    await ctx.answerCallbackQuery("Platform tidak dikenal.");
    return;
  }

  const p = config.PROVIDERS[targetProvider];

  if (p.usable === false) {
    await ctx.answerCallbackQuery("❌ Tidak bisa dipakai");
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
  await ctx.answerCallbackQuery(`${p.name} dipilih!`);
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
  await ctx.answerCallbackQuery(`Model: ${model}`);
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
    await ctx.answerCallbackQuery("Ratio tidak valid.");
    return;
  }

  const s = getUserSettings(ctx.from.id);
  s.ratio = targetRatio;

  await ctx.answerCallbackQuery(`Ratio: ${targetRatio}`);
  await ctx.editMessageText(
    `✅ *Ratio Diubah*\n\n📐 \`${targetRatio}\``,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🏠 Main Menu", "menu:main") }
  );
});

bot.callbackQuery(/^set_resolution:(.+)$/, async (ctx) => {
  const targetRes = ctx.match[1];
  if (!config.RESOLUTIONS.includes(targetRes)) {
    await ctx.answerCallbackQuery("Resolusi tidak valid.");
    return;
  }

  const s = getUserSettings(ctx.from.id);
  s.resolution = targetRes;

  await ctx.answerCallbackQuery(`Resolusi: ${targetRes}`);
  await ctx.editMessageText(
    `✅ *Resolusi Diubah*\n\n🖥️ \`${targetRes}\``,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🏠 Main Menu", "menu:main") }
  );
});

bot.callbackQuery(/^set_duration:(.+)$/, async (ctx) => {
  const targetDuration = ctx.match[1];
  if (!config.DURATIONS.includes(targetDuration)) {
    await ctx.answerCallbackQuery("Durasi tidak valid.");
    return;
  }

  const s = getUserSettings(ctx.from.id);
  s.duration = targetDuration;

  const durationLabel = targetDuration === "auto" ? "Auto" : `${targetDuration} detik`;
  await ctx.answerCallbackQuery(`Durasi: ${durationLabel}`);
  await ctx.editMessageText(
    `✅ *Durasi Diubah*\n\n⏱️ \`${durationLabel}\``,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🏠 Main Menu", "menu:main") }
  );
});

bot.callbackQuery(/^set_motion:(.+)$/, async (ctx) => {
  const targetMotion = ctx.match[1];
  if (!config.MOTION_OPTIONS.includes(targetMotion)) {
    await ctx.answerCallbackQuery("Motion tidak valid.");
    return;
  }

  const s = getUserSettings(ctx.from.id);
  s.motion = targetMotion;

  const label = targetMotion === "none" ? "❌ Off" : `🎬 ${targetMotion}`;
  await ctx.answerCallbackQuery(`Motion: ${label}`);
  await ctx.editMessageText(
    `✅ *Motion Diubah*\n\n🎬 \`${label}\``,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🏠 Main Menu", "menu:main") }
  );
});

// ─── Inventory Admin: Callback Handlers ──────────────────────────────────────
bot.callbackQuery(/^inv:(.+)$/, async (ctx) => {
  const action = ctx.match[1];
  await ctx.answerCallbackQuery();
  if (!inventory.isAdmin(ctx)) {
    await ctx.reply("⛔ Akses ditolak.");
    return;
  }

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
});

// ─── Inventory Admin: Document Upload Handler ────────────────────────────────
bot.on("message:document", async (ctx) => {
  const pending = inventory.pendingUploads.get(ctx.from?.id);
  if (!pending || pending.stage !== "await_file") return; // not an inventory upload
  await inventory.handleUpload(ctx);
});

// ─── Fallback: Unknown text messages ─────────────────────────────────────────
bot.on("message:text", async (ctx) => {
  if (ctx.message.text.startsWith("/")) return;

  await showMainMenu(ctx, `💡 Maaf, saya tidak mengerti "${ctx.message.text.substring(0, 30)}"\n\nGunakan menu di bawah:`);
});

// ─── Error Handler ───────────────────────────────────────────────────────────
bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error while handling update ${ctx.update.update_id}:`);
  console.error(err.error);
  ctx.reply("⚠️ Terjadi error internal. Silakan coba lagi nanti.").catch(() => {});
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
  ]);
}

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("🎬 AI Video Generator Bot (Multi-Model)");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("🚀 Starting bot...\n");

setupBot()
  .then(() => invDb.init())
  .then(() => bot.start())
  .catch(() => bot.start());
