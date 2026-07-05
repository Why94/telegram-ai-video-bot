const config = require("../config");

/**
 * Submit a video generation task to Luma Dream Machine.
 */
async function submitTask(prompt, imageBase64 = null, options = {}) {
  const providerConfig = config.PROVIDERS.luma;
  if (!providerConfig.apiKey || providerConfig.apiKey.startsWith("your_")) {
    return { success: false, error: "Luma AI API Key belum diatur di file .env." };
  }

  const model = options.model || providerConfig.defaultModel;
  const ratio = options.ratio || config.defaultAspectRatio;
  const resolutionOption = options.resolution || config.defaultResolution;
  const duration = options.duration === "auto" ? "5s" : `${options.duration}s`;

  // Luma supports 540p, 720p, 1080p, 4k
  const resolution = resolutionOption === "480p" ? "540p" : resolutionOption;

  const endpoint = `${providerConfig.apiBase}/generations`;

  // Ray-2 supports standard text / image configuration
  const payload = {
    prompt: prompt,
    model: model,
    duration: duration,
    aspect_ratio: ratio,
    resolution: resolution,
  };

  if (imageBase64) {
    // Luma usually accepts image urls, we can post base64 or pass it as first_frame
    payload.keyframes = {
      frame0: {
        type: "image",
        url: imageBase64
      }
    };
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${providerConfig.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (data.id) {
      return { success: true, taskId: data.id };
    } else {
      const errorMsg = data.message || data.error?.message || JSON.stringify(data);
      return { success: false, error: errorMsg };
    }
  } catch (err) {
    return { success: false, error: `Network error: ${err.message}` };
  }
}

/**
 * Poll task status from Luma Dream Machine.
 */
async function pollTask(taskId) {
  const providerConfig = config.PROVIDERS.luma;
  const endpoint = `${providerConfig.apiBase}/generations/${taskId}`;

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${providerConfig.apiKey}`,
      },
    });

    const data = await response.json();

    let status = "unknown";
    if (data.state === "completed" || data.status === "completed" || data.status === "succeeded") {
      status = "succeeded";
    } else if (data.state === "processing" || data.state === "generating" || data.status === "running") {
      status = "running";
    } else if (data.state === "queued" || data.status === "queued" || data.state === "pending") {
      status = "queued";
    } else if (data.state === "failed" || data.status === "failed") {
      status = "failed";
    }

    return {
      status: status,
      content: data,
      error: data.failure_reason || null,
      raw: data,
    };
  } catch (err) {
    return { status: "error", error: `Network error: ${err.message}` };
  }
}

/**
 * Extract video URL.
 */
function findVideoUrl(obj) {
  if (obj && obj.assets?.video) return obj.assets.video;
  if (obj && obj.video) return obj.video;
  if (obj && obj.url) return obj.url;
  return null;
}

module.exports = {
  submitTask,
  pollTask,
  findVideoUrl,
};
