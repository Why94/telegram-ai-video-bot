const config = require("../config");

/**
 * Submit a video generation task to MiniMax/Hailuo.
 */
async function submitTask(prompt, imageBase64 = null, options = {}) {
  const providerConfig = config.PROVIDERS.hailuo;
  if (!providerConfig.apiKey || providerConfig.apiKey.startsWith("your_")) {
    return { success: false, error: "MiniMax / Hailuo API Key belum diatur di file .env." };
  }

  const model = options.model || providerConfig.defaultModel;
  const ratio = options.ratio || config.defaultAspectRatio;
  const resolutionOption = options.resolution || config.defaultResolution;
  const duration = options.duration === "auto" ? 6 : parseInt(options.duration, 10);

  // Map resolution dynamically based on aspect ratio
  let resolution = "1280x720";
  if (ratio === "16:9") {
    if (resolutionOption === "480p") resolution = "854x480";
    else if (resolutionOption === "1080p") resolution = "1920x1080";
    else resolution = "1280x720";
  } else if (ratio === "9:16") {
    if (resolutionOption === "480p") resolution = "480x854";
    else if (resolutionOption === "1080p") resolution = "1080x1920";
    else resolution = "720x1280";
  } else if (ratio === "1:1") {
    resolution = "768x768";
  }

  // Endpoint
  const endpoint = `${providerConfig.apiBase}/video_generation`;

  const payload = {
    model: model,
    prompt: prompt,
    duration: duration,
    resolution: resolution,
  };

  if (imageBase64) {
    payload.image = imageBase64;
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

    if (data.task_id) {
      return { success: true, taskId: data.task_id };
    } else {
      const errorMsg = data.message || data.error?.message || JSON.stringify(data);
      return { success: false, error: errorMsg };
    }
  } catch (err) {
    return { success: false, error: `Network error: ${err.message}` };
  }
}

/**
 * Poll task status from MiniMax/Hailuo AI.
 */
async function pollTask(taskId) {
  const providerConfig = config.PROVIDERS.hailuo;
  const endpoint = `${providerConfig.apiBase}/query_video_generation?task_id=${taskId}`;

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${providerConfig.apiKey}`,
      },
    });

    const data = await response.json();

    let status = "unknown";
    if (data.status === "completed" || data.status === "succeeded" || data.status === "success") {
      status = "succeeded";
    } else if (data.status === "processing" || data.status === "running") {
      status = "running";
    } else if (data.status === "preparing" || data.status === "pending" || data.status === "queued") {
      status = "queued";
    } else if (data.status === "failed" || data.status === "error") {
      status = "failed";
    }

    return {
      status: status,
      content: data,
      error: data.error_message || data.message || null,
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
  if (obj && obj.video_url) return obj.video_url;
  if (obj && obj.url) return obj.url;
  if (obj && obj.result) return obj.result;
  return null;
}

module.exports = {
  submitTask,
  pollTask,
  findVideoUrl,
};
