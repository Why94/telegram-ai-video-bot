const { Bot, InlineKeyboard } = require("grammy");
const config = require("./lib/config");
const providers = require("./lib/providers");
const helpers = require("./lib/telegram-helpers");

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
      generateAudio: config.generateAudio,
    });
  }
  return userSettings.get(userId);
}

// ─── Bot Instance ────────────────────────────────────────────────────────────
const bot = new Bot(config.telegramToken);

// ─── Main Menu ───────────────────────────────────────────────────────────────
function mainMenuKeyboard() {
  return new InlineKeyboard()
    .text("🎬 Generate Video", "menu:generate")
    .text("⚙️ Settings", "menu:settings")
    .row()
    .text("🤖 Model", "menu:model")
    .text("📐 Ratio", "menu:ratio")
    .row()
    .text("🖥️ Resolution", "menu:resolution")
    .text("⏱ Duration", "menu:duration")
    .row()
    .text("❓ Help", "menu:help");
}

async function showMainMenu(ctx, text = null) {
  const name = ctx.from?.first_name || "User";
  const s = getUserSettings(ctx.from.id);
  const providerInfo = config.PROVIDERS[s.provider];

  const msg = text || (
    `🎬 *AI Video Generator Bot*\n\n` +
    `Halo *${name}*! 👋\n\n` +
    `🔌 *Platform aktif:* ${providerInfo.name}\n` +
    `📐 *Ratio:* ${s.ratio} | 🖥️ *Res:* ${s.resolution || "720p"}\n\n` +
    `👇 Pilih menu di bawah:`
  );

  await ctx.reply(msg, {
    parse_mode: "Markdown",
    reply_markup: mainMenuKeyboard(),
  });
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
      await ctx.reply(
        `🎬 *Generate Video*\n\nKetik prompt kamu di bawah:\n\n` +
        `Contoh:\n` +
        `\`/generate A golden retriever running on the beach at sunset\``,
        { parse_mode: "Markdown" }
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
    case "help":
      await ctx.reply(
        `📖 *Panduan Lengkap*\n\n` +
        `🎬 *Generate Video:*\n` +
        `Ketik \`/generate <prompt>\` atau klik *Generate Video* di menu\n\n` +
        `🖼 *Image-to-Video:*\n` +
        `Kirim foto dengan caption/prompt\n\n` +
        `⚙️ *Pengaturan:*\n` +
        `Gunakan menu untuk ganti model, ratio, resolusi, durasi\n\n` +
        `🤖 *Platform:* BytePlus, Kling, Hailuo, Luma, Runway, Veo, Leonardo`,
        { parse_mode: "Markdown" }
      );
      break;
  }
});

// ─── Shared functions ──────────────────────────────────────────────────────
async function showSettings(ctx) {
  const s = getUserSettings(ctx.from.id);
  const providerInfo = config.PROVIDERS[s.provider];

  const keyboard = new InlineKeyboard().text("🏠 Main Menu", "menu:main");
  await ctx.reply(
    `⚙️ *Pengaturan Saat Ini*\n\n` +
      `🔌 Platform: *${providerInfo.name}*\n` +
      `🤖 Model ID: \`${s.model}\`\n` +
      `📐 Aspect Ratio: *${s.ratio}*\n` +
      `🖥️ Resolusi: *${s.resolution || "720p"}*\n` +
      `⏱ Durasi: *${s.duration === "auto" ? "Auto" : s.duration + " detik"}*\n` +
      `🔊 Audio: *${s.generateAudio ? "Ya" : "Tidak"}*\n`,
    { parse_mode: "Markdown", reply_markup: keyboard }
  );
}

async function showModelPicker(ctx) {
  const s = getUserSettings(ctx.from.id);
  const activeProviderName = config.PROVIDERS[s.provider].name;

  const keyboard = new InlineKeyboard()
    .text("BytePlus Seedance", "set_provider:byteplus")
    .text("Kling AI", "set_provider:kling")
    .row()
    .text("Hailuo / MiniMax", "set_provider:hailuo")
    .text("Luma Dream Machine", "set_provider:luma")
    .row()
    .text("Runway", "set_provider:runway")
    .text("Google Veo 2", "set_provider:veo")
    .row()
    .text("Leonardo AI", "set_provider:leonardo")
    .row()
    .text("🏠 Main Menu", "menu:main");

  await ctx.reply(
    `🤖 *Pilih Platform Generator Video AI*\n\n` +
      `Platform aktif saat ini: *${activeProviderName}*`,
    { parse_mode: "Markdown", reply_markup: keyboard }
  );
}

async function showRatioPicker(ctx) {
  const s = getUserSettings(ctx.from.id);
  const keyboard = new InlineKeyboard()
    .text("16:9 (Landscape)", "set_ratio:16:9")
    .text("9:16 (Shorts/Portrait)", "set_ratio:9:16")
    .row()
    .text("1:1 (Square)", "set_ratio:1:1")
    .text("21:9 (Cinematic)", "set_ratio:21:9")
    .row()
    .text("4:3 (Classic TV)", "set_ratio:4:3")
    .text("3:4 (Vertical Feed)", "set_ratio:3:4")
    .row()
    .text("🏠 Main Menu", "menu:main");

  await ctx.reply(
    `📐 *Pilih Aspect Ratio*\nRatio saat ini: *${s.ratio}*`,
    { parse_mode: "Markdown", reply_markup: keyboard }
  );
}

async function showResolutionPicker(ctx) {
  const s = getUserSettings(ctx.from.id);
  const current = s.resolution || "720p";
  const keyboard = new InlineKeyboard()
    .text("480p (Standard)", "set_resolution:480p")
    .text("720p (HD/Default)", "set_resolution:720p")
    .row()
    .text("1080p (FHD)", "set_resolution:1080p")
    .text("4k (UHD/Premium)", "set_resolution:4k")
    .row()
    .text("🏠 Main Menu", "menu:main");

  await ctx.reply(
    `🖥️ *Pilih Resolusi*\nResolusi saat ini: *${current}*`,
    { parse_mode: "Markdown", reply_markup: keyboard }
  );
}

async function showDurationPicker(ctx) {
  const s = getUserSettings(ctx.from.id);
  const current = s.duration === "auto" ? "Auto" : `${s.duration} detik`;
  const keyboard = new InlineKeyboard()
    .text("Auto", "set_duration:auto")
    .text("5 Detik", "set_duration:5")
    .row()
    .text("8 Detik", "set_duration:8")
    .text("10 Detik", "set_duration:10")
    .row()
    .text("15 Detik", "set_duration:15")
    .row()
    .text("🏠 Main Menu", "menu:main");

  await ctx.reply(
    `⏱ *Pilih Durasi*\nDurasi saat ini: *${current}*`,
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
    const s = getUserSettings(ctx.from.id);
    s.provider = arg;
    s.model = config.PROVIDERS[arg].defaultModel;

    const targetName = config.PROVIDERS[arg].name;
    const keyboard = new InlineKeyboard().text("🏠 Main Menu", "menu:main");
    await ctx.reply(
      `✅ Platform berhasil diubah ke *${targetName}*\nModel default: \`${s.model}\``,
      { parse_mode: "Markdown", reply_markup: keyboard }
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

// ─── /generate Command ──────────────────────────────────────────────────────
bot.command("generate", async (ctx) => {
  const prompt = ctx.match?.trim();

  if (!prompt) {
    await ctx.reply(
      `❗ *Prompt diperlukan!*\n\n` +
        `Contoh:\n` +
        `\`/generate A golden retriever running on the beach at sunset, cinematic slow motion\``,
      { parse_mode: "Markdown" }
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

  // Send initial status
  const modeText = imageBase64 ? "🖼 Image-to-Video" : "✍️ Text-to-Video";
  let statusMsg = existingStatusMsg;

  const startingText = `⏳ *Memulai Generate Video...*\n\n` +
    `🔌 Platform: *${providerInfo.name}*\n` +
    `🤖 Model: \`${s.model}\`\n` +
    `📝 Prompt: _${prompt.substring(0, 100)}${prompt.length > 100 ? "..." : ""}_\n\n` +
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
    generateAudio: s.generateAudio,
  });

  if (!submitResult.success) {
    await ctx.api.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      `❌ *Gagal submit task!*\n\n` +
        `🔌 Platform: *${providerInfo.name}*\n` +
        `Error: ${submitResult.error}`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  const taskId = submitResult.taskId;

  // Update status: submitted
  await ctx.api.editMessageText(
    ctx.chat.id,
    statusMsg.message_id,
    `✅ *Task berhasil di-submit!*\n\n` +
      `🔌 Platform: *${providerInfo.name}*\n` +
      `🆔 Task ID: \`${taskId}\`\n` +
      `📝 Prompt: _${prompt.substring(0, 80)}${prompt.length > 80 ? "..." : ""}_\n\n` +
      `⏳ Menunggu proses selesai... (max 10 menit)\n` +
      `🔄 Status: *Queued*`,
    { parse_mode: "Markdown" }
  );

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
        `🎬 *Generating Video...* ${dots}\n\n` +
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
    await ctx.api.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      `✅ *Video Berhasil Di-generate!*\n\n` +
        `🔌 Platform: *${providerInfo.name}*\n` +
        `🆔 Task ID: \`${taskId}\`\n\n` +
        `📥 Mengirim video ke chat...`,
      { parse_mode: "Markdown" }
    );

    const caption =
      `🎬 *AI Generated Video*\n\n` +
      `🔌 Platform: *${providerInfo.name}*\n` +
      `📝 _${prompt.substring(0, 150)}${prompt.length > 150 ? "..." : ""}_`;

    await helpers.sendVideoFromUrl(ctx, result.videoUrl, caption);

    // Final status update
    await ctx.api.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      `✅ *Selesai!*\n\n` +
        `🔌 Platform: *${providerInfo.name}*\n` +
        `🆔 Task ID: \`${taskId}\`\n` +
        `📝 Prompt: _${prompt.substring(0, 80)}${prompt.length > 80 ? "..." : ""}_\n\n` +
        `✨ Video telah terkirim!`,
      { parse_mode: "Markdown" }
    );
  } else {
    await ctx.api.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      `❌ *Generate Video Gagal*\n\n` +
        `🔌 Platform: *${providerInfo.name}*\n` +
        `🆔 Task ID: \`${taskId}\`\n\n` +
        `Error: ${result.error}\n\n` +
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

  const s = getUserSettings(ctx.from.id);
  s.provider = targetProvider;
  s.model = config.PROVIDERS[targetProvider].defaultModel;

  const targetName = config.PROVIDERS[targetProvider].name;
  await ctx.answerCallbackQuery(`Berhasil memilih ${targetName}!`);
  await ctx.editMessageText(
    `✅ *Platform berhasil diubah!*\n\n` +
      `🔌 Platform aktif: *${targetName}*\n` +
      `🤖 Model default: \`${s.model}\``,
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

  await ctx.answerCallbackQuery(`Ratio diubah ke ${targetRatio}`);
  await ctx.editMessageText(
    `✅ *Aspect Ratio berhasil diubah!*\n\n📐 *${targetRatio}*`,
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

  await ctx.answerCallbackQuery(`Resolusi diubah ke ${targetRes}`);
  await ctx.editMessageText(
    `✅ *Resolusi berhasil diubah!*\n\n🖥️ *${targetRes}*`,
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
  await ctx.answerCallbackQuery(`Durasi diubah ke ${durationLabel}`);
  await ctx.editMessageText(
    `✅ *Durasi berhasil diubah!*\n\n⏱️ *${durationLabel}*`,
    { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("🏠 Main Menu", "menu:main") }
  );
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
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("🎬 AI Video Generator Bot (Multi-Model)");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("🚀 Starting bot...\n");

bot.start();
