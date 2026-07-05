const config = require("../config");

/**
 * Submit a video generation task to Runway.
 */
async function submitTask(prompt, imageBase64 = null, options = {}) {
  const providerConfig = config.PROVIDERS.runway;
  if (!providerConfig.apiKey || providerConfig.apiKey.startsWith("your_")) {
    return { success: false, error: "Runway API Key belum diatur di file .env." };
  }

  const model = options.model || providerConfig.defaultModel;
  const ratio = options.ratio || config.defaultAspectRatio;
  const resolutionOption = options.resolution || config.defaultResolution;
  const duration = options.duration === "auto" ? 5 : parseInt(options.duration, 10);

  // Map ratio based on aspect ratio + resolution option
  let runwayRatio = "1280:720";
  if (ratio === "16:9") {
    if (resolutionOption === "480p") runwayRatio = "854:480";
    else if (resolutionOption === "1080p") runwayRatio = "1920:1080";
    else runwayRatio = "1280:720";
  } else if (ratio === "9:16") {
    if (resolutionOption === "480p") runwayRatio = "480:854";
    else if (resolutionOption === "1080p") runwayRatio = "1080:1920";
    else runwayRatio = "720:1280";
  } else if (ratio === "1:1") {
    if (resolutionOption === "480p") runwayRatio = "480:480";
    else if (resolutionOption === "1080p") runwayRatio = "1080:1080";
    else runwayRatio = "768:768";
  }

  const endpoint = `${providerConfig.apiBase}/tasks`;

  const payload = {
    model: model,
    promptText: prompt,
    ratio: runwayRatio,
    duration: duration,
  };

  if (imageBase64) {
    payload.promptImage = imageBase64;
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${providerConfig.apiKey}`,
        "X-Runway-Version": "2024-11-06"
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (data.id || data.taskId) {
      return { success: true, taskId: data.id || data.taskId };
    } else {
      const errorMsg = data.message || data.error?.message || JSON.stringify(data);
      return { success: false, error: errorMsg };
    }
  } catch (err) {
    return { success: false, error: `Network error: ${err.message}` };
  }
}

/**
 * Poll task status from Runway AI.
 */
async function pollTask(taskId) {
  const providerConfig = config.PROVIDERS.runway;
  const endpoint = `${providerConfig.apiBase}/tasks/${taskId}`;

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${providerConfig.apiKey}`,
        "X-Runway-Version": "2024-11-06"
      },
    });

    const data = await response.json();

    let status = "unknown";
    if (data.status === "SUCCEEDED" || data.status === "succeeded" || data.status === "completed") {
      status = "succeeded";
    } else if (data.status === "RUNNING" || data.status === "running" || data.status === "processing") {
      status = "running";
    } else if (data.status === "PENDING" || data.status === "pending" || data.status === "queued") {
      status = "queued";
    } else if (data.status === "FAILED" || data.status === "failed") {
      status = "failed";
    }

    return {
      status: status,
      content: data,
      error: data.failureReason || null,
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
  if (obj && obj.output && Array.isArray(obj.output)) return obj.output[0];
  if (obj && obj.video_url) return obj.video_url;
  if (obj && obj.url) return obj.url;
  return null;
}

module.exports = {
  submitTask,
  pollTask,
  findVideoUrl,
};
