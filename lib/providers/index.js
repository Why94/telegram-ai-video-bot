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

// Per-task API key storage (used by providers like Leonardo that need a per-account key)
const taskApiKeys = new Map();

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

  const result = await selectedProvider.submitTask(finalPrompt, imageBase64, options);

  // Remember the api key for this task so polling can use the same account
  if (result.success && options.apiKey) {
    taskApiKeys.set(result.taskId, options.apiKey);
  }

  return result;
}

/**
 * Poll task status of a specific provider.
 */
async function pollTask(provider, taskId) {
  const selectedProvider = providers[provider];
  if (!selectedProvider) {
    return { status: "error", error: `Provider "${provider}" tidak terdaftar.` };
  }
  const apiKey = taskApiKeys.get(taskId);
  if (typeof selectedProvider.pollTask === "function" && selectedProvider.pollTask.length >= 2) {
    return selectedProvider.pollTask(taskId, apiKey);
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
    const apiKey = taskApiKeys.get(taskId);
    const result = typeof selectedProvider.pollTask === "function" && selectedProvider.pollTask.length >= 2
      ? await selectedProvider.pollTask(taskId, apiKey)
      : await selectedProvider.pollTask(taskId);
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
      taskApiKeys.delete(taskId);
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
      taskApiKeys.delete(taskId);
      return {
        success: false,
        error: result.error || `Task status: ${result.status}`
      };
    }

    if (result.status === "error") {
      taskApiKeys.delete(taskId);
      return { success: false, error: result.error || "Terjadi kesalahan koneksi API." };
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  taskApiKeys.delete(taskId);
  return { success: false, error: `Batas waktu habis: Video tidak selesai dalam ${maxWaitMs / 60000} menit.` };
}

module.exports = {
  submitTask,
  pollTask,
  findVideoUrl,
  waitForCompletion,
  providers
};
