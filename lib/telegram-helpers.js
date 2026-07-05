const { InputFile } = require("grammy");

/**
 * Download a file from a URL and return it as a Buffer.
 *
 * @param {string} url - The URL to download from
 * @returns {Promise<Buffer>} The file content as a Buffer
 */
async function downloadFileAsBuffer(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download file: HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Download a photo from Telegram and convert it to a base64 data URI.
 * Picks the largest available photo size.
 *
 * @param {import("grammy").Context} ctx - grammY context
 * @returns {Promise<string>} Base64 data URI string (data:image/jpeg;base64,...)
 */
async function getPhotoAsBase64(ctx) {
  const photos = ctx.message.photo;
  if (!photos || photos.length === 0) {
    throw new Error("No photo found in message.");
  }

  // Get the largest photo (last in array)
  const largestPhoto = photos[photos.length - 1];
  const file = await ctx.api.getFile(largestPhoto.file_id);

  // Build download URL
  const fileUrl = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;

  const buffer = await downloadFileAsBuffer(fileUrl);
  const base64 = buffer.toString("base64");

  // Determine MIME type from file extension
  const ext = file.file_path.split(".").pop().toLowerCase();
  const mimeMap = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
  const mime = mimeMap[ext] || "image/jpeg";

  return `data:${mime};base64,${base64}`;
}

/**
 * Download a video from URL and send it to the Telegram chat.
 * If the video is too large (>50MB), sends a download link instead.
 *
 * @param {import("grammy").Context} ctx - grammY context
 * @param {string} videoUrl - URL of the video to send
 * @param {string} caption - Caption for the video
 * @returns {Promise<void>}
 */
async function sendVideoFromUrl(ctx, videoUrl, caption) {
  try {
    // First check the file size with a HEAD request
    let fileSize = 0;
    try {
      const headResponse = await fetch(videoUrl, { method: "HEAD" });
      const contentLength = headResponse.headers.get("content-length");
      if (contentLength) {
        fileSize = parseInt(contentLength, 10);
      }
    } catch {
      // If HEAD fails, try downloading anyway
    }

    const TELEGRAM_MAX_SIZE = 50 * 1024 * 1024; // 50MB

    if (fileSize > TELEGRAM_MAX_SIZE) {
      // File too large for Telegram — send a download link
      await ctx.reply(
        `🎥 *Video berhasil di-generate!*\n\n` +
          `⚠️ File terlalu besar untuk dikirim via Telegram (${(fileSize / 1024 / 1024).toFixed(1)}MB).\n\n` +
          `📥 [Download Video](${videoUrl})`,
        { parse_mode: "Markdown", link_preview_is_disabled: true }
      );
      return;
    }

    // Download and send
    const buffer = await downloadFileAsBuffer(videoUrl);
    const inputFile = new InputFile(buffer, "ai_video.mp4");

    await ctx.replyWithVideo(inputFile, {
      caption: caption,
      parse_mode: "Markdown",
      supports_streaming: true,
    });
  } catch (err) {
    // Fallback: send download link if sending fails
    console.error("Failed to send video directly:", err.message);
    await ctx.reply(
      `🎥 *Video berhasil di-generate!*\n\n` +
        `⚠️ Gagal mengirim video langsung. Silakan download:\n\n` +
        `📥 [Download Video](${videoUrl})`,
      { parse_mode: "Markdown", link_preview_is_disabled: true }
    );
  }
}

/**
 * Format a status update message with appropriate emoji.
 *
 * @param {string} status - Task status string
 * @param {string} taskId - Task ID for reference
 * @returns {string} Formatted status message
 */
function formatStatusMessage(status, taskId) {
  const statusEmoji = {
    queued: "⏳",
    running: "🔄",
    succeeded: "✅",
    failed: "❌",
    expired: "⏰",
    error: "🚫",
  };

  const statusText = {
    queued: "Antrian — Menunggu giliran...",
    running: "Sedang diproses — AI sedang membuat video...",
    succeeded: "Selesai!",
    failed: "Gagal",
    expired: "Kedaluwarsa (timeout)",
    error: "Error",
  };

  const emoji = statusEmoji[status] || "❓";
  const text = statusText[status] || status;

  return `${emoji} *Status:* ${text}\n🆔 Task: \`${taskId}\``;
}

/**
 * Escape special characters for Telegram MarkdownV2.
 *
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeMarkdown(text) {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}

module.exports = {
  downloadFileAsBuffer,
  getPhotoAsBase64,
  sendVideoFromUrl,
  formatStatusMessage,
  escapeMarkdown,
};
