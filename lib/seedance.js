const config = require("./config");

const API_BASE = config.apiBase;

/**
 * Submit a video generation task to BytePlus Seedance API.
 *
 * @param {string} prompt - Text prompt describing the video
 * @param {string|null} imageBase64 - Optional base64-encoded image (data:image/... format) for Image-to-Video
 * @param {object} options - Override default settings
 * @param {string} options.model - Seedance model endpoint ID
 * @param {string} options.ratio - Aspect ratio (e.g. "16:9")
 * @param {string} options.duration - Duration in seconds or "auto"
 * @param {boolean} options.generateAudio - Whether to generate audio
 * @returns {Promise<{success: boolean, taskId?: string, error?: string}>}
 */
async function submitTask(prompt, imageBase64 = null, options = {}) {
  const model = options.model || config.seedanceModel;
  const ratio = options.ratio || config.defaultAspectRatio;
  const duration = options.duration || config.defaultDuration;
  const generateAudio = options.generateAudio !== undefined ? options.generateAudio : config.generateAudio;

  // Build content array (same structure as the HTML app)
  const content = [];

  if (prompt) {
    content.push({ type: "text", text: prompt });
  }

  if (imageBase64) {
    content.push({
      type: "image_url",
      image_url: { url: imageBase64 },
    });
  }

  if (content.length === 0) {
    return { success: false, error: "No prompt or image provided." };
  }

  // Build request payload
  const payload = {
    model: model,
    content: content,
    generate_audio: generateAudio,
    ratio: ratio,
    watermark: false,
  };

  if (duration !== "auto") {
    payload.duration = parseInt(duration, 10);
  }

  try {
    const response = await fetch(API_BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.byteplusApiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (data.id) {
      return { success: true, taskId: data.id };
    } else {
      const errorMsg = data.error?.message || JSON.stringify(data);
      return { success: false, error: errorMsg };
    }
  } catch (err) {
    return { success: false, error: `Network error: ${err.message}` };
  }
}

/**
 * Poll a single task's status from the Seedance API.
 *
 * @param {string} taskId - The task ID to check
 * @returns {Promise<{status: string, content?: object, error?: string}>}
 */
async function pollTask(taskId) {
  try {
    const response = await fetch(`${API_BASE}/${taskId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.byteplusApiKey}`,
      },
    });

    const data = await response.json();

    return {
      status: data.status || "unknown",
      content: data.content || null,
      error: data.error?.message || null,
      raw: data,
    };
  } catch (err) {
    return { status: "error", error: `Network error: ${err.message}` };
  }
}

/**
 * Recursively search for a video URL in the API response object.
 * Replicates the logic from the existing HTML application.
 *
 * @param {any} obj - The object to search through
 * @returns {string|null} The video URL if found, null otherwise
 */
function findVideoUrl(obj) {
  if (
    typeof obj === "string" &&
    obj.startsWith("http") &&
    (obj.includes(".mp4") || obj.includes(".mov") || obj.includes("sign="))
  ) {
    return obj;
  }

  if (obj !== null && typeof obj === "object") {
    // Check common keys first
    if (obj.video_url && typeof obj.video_url === "string") return obj.video_url;
    if (obj.video_url && obj.video_url.url) return obj.video_url.url;
    if (obj.url && typeof obj.url === "string" && (obj.url.includes(".mp4") || obj.url.includes("sign="))) {
      return obj.url;
    }

    // Recursive search
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const result = findVideoUrl(obj[key]);
        if (result) return result;
      }
    }
  }

  return null;
}

/**
 * Wait for a task to complete by polling at regular intervals.
 *
 * @param {string} taskId - The task ID to monitor
 * @param {function} onStatusChange - Callback for status updates: (status, detail) => void
 * @param {number} maxWaitMs - Maximum time to wait in milliseconds
 * @param {number} intervalMs - Polling interval in milliseconds
 * @returns {Promise<{success: boolean, videoUrl?: string, error?: string}>}
 */
async function waitForCompletion(
  taskId,
  onStatusChange = null,
  maxWaitMs = config.maxWaitMs,
  intervalMs = config.pollIntervalMs
) {
  const startTime = Date.now();
  let lastStatus = "";

  while (Date.now() - startTime < maxWaitMs) {
    const result = await pollTask(taskId);

    // Notify on status change
    if (result.status !== lastStatus) {
      lastStatus = result.status;
      if (onStatusChange) {
        onStatusChange(result.status, result);
      }
    }

    // Check terminal states
    if (result.status === "succeeded") {
      const videoUrl = findVideoUrl(result.content);
      if (videoUrl) {
        return { success: true, videoUrl };
      } else {
        return {
          success: false,
          error: "Video generated but URL not found in response.",
          rawContent: result.content,
        };
      }
    }

    if (result.status === "failed" || result.status === "expired") {
      return {
        success: false,
        error: result.error || `Task ${result.status}.`,
      };
    }

    if (result.status === "error") {
      return { success: false, error: result.error || "Unknown API error." };
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return { success: false, error: `Timeout: task did not complete within ${maxWaitMs / 60000} minutes.` };
}

module.exports = {
  submitTask,
  pollTask,
  findVideoUrl,
  waitForCompletion,
};
