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
  ernie: require("./ernie"),
  replicate: require("./replicate"),
  runninghub: require("./runninghub"),
  freetheai: require("./freetheai"),
  kie: require("./kie"),
  pollinations: require("./pollinations")
};

const MOTION_PROMPTS = {
  "pan-left": "Camera panning smoothly to the left, ",
  "pan-right": "Camera panning smoothly to the right, ",
  "zoom-in": "Camera slowly zooming in, ",
  "zoom-out": "Camera slowly zooming out, ",
  "tilt-up": "Camera tilting upward, ",
  "tilt-down": "Camera tilting downward, ",
  "orbit": "Camera orbiting around the subject, ",
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

  // Inject camera motion instruction into prompt
  let finalPrompt = prompt;
  const motion = options.motion || "none";
  if (motion !== "none" && MOTION_PROMPTS[motion]) {
    finalPrompt = MOTION_PROMPTS[motion] + prompt;
  }

  return selectedProvider.submitTask(finalPrompt, imageBase64, options);
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
