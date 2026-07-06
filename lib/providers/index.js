const config = require("../config");

// Load all individual providers
const providers = {
  byteplus: require("./byteplus"),
  kling: require("./kling"),
  hailuo: require("./hailuo"),
  luma: require("./luma"),
  runway: require("./runway"),
  veo: require("./veo"),
  leonardo: require("./leonardo"),
  ernie: require("./ernie")
};

/**
 * Submit a video task to a specific provider.
 *
 * @param {string} provider - Key of the provider (e.g. 'kling')
 * @param {string} prompt - Text prompt
 * @param {string|null} imageBase64 - Base64 image
 * @param {object} options - Custom parameters
 */
async function submitTask(provider, prompt, imageBase64 = null, options = {}) {
  const selectedProvider = providers[provider];
  if (!selectedProvider) {
    return { success: false, error: `Provider "${provider}" tidak terdaftar.` };
  }
  return selectedProvider.submitTask(prompt, imageBase64, options);
}

/**
 * Poll task status of a specific provider.
 */
async function pollTask(provider, taskId) {
  const selectedProvider = providers[provider];
  if (!selectedProvider) {
    return { status: "error", error: `Provider "${provider}" tidak terdaftar.` };
  }
  return selectedProvider.pollTask(taskId);
}

/**
 * Search for video URL.
 */
function findVideoUrl(provider, responseObj) {
  const selectedProvider = providers[provider];
  if (!selectedProvider) return null;
  return selectedProvider.findVideoUrl(responseObj);
}

/**
 * Wait for completion with generic polling.
 */
async function waitForCompletion(
  provider,
  taskId,
  onStatusChange = null,
  maxWaitMs = config.maxWaitMs,
  intervalMs = config.pollIntervalMs
) {
  const selectedProvider = providers[provider];
  if (!selectedProvider) {
    return { success: false, error: `Provider "${provider}" tidak terdaftar.` };
  }

  const startTime = Date.now();
  let lastStatus = "";
  let lastUpdateTime = 0;

  while (Date.now() - startTime < maxWaitMs) {
    const elapsed = Date.now() - startTime;
    const result = await selectedProvider.pollTask(taskId);
    const statusChanged = result.status !== lastStatus;

    if (statusChanged) {
      lastStatus = result.status;
    }

    if (onStatusChange && (statusChanged || elapsed - lastUpdateTime >= 10000)) {
      lastUpdateTime = elapsed;
      onStatusChange(result.status, result, elapsed);
    }

    if (result.status === "succeeded") {
      const videoUrl = selectedProvider.findVideoUrl(result.content);
      if (videoUrl) {
        return { success: true, videoUrl };
      } else {
        return {
          success: false,
          error: "Video berhasil di-generate tetapi URL hasil tidak ditemukan.",
          rawContent: result.content
        };
      }
    }

    if (result.status === "failed" || result.status === "expired") {
      return {
        success: false,
        error: result.error || `Task status: ${result.status}`
      };
    }

    if (result.status === "error") {
      return { success: false, error: result.error || "Terjadi kesalahan koneksi API." };
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return { success: false, error: `Batas waktu habis: Video tidak selesai dalam ${maxWaitMs / 60000} menit.` };
}

module.exports = {
  submitTask,
  pollTask,
  findVideoUrl,
  waitForCompletion,
  providers
};
