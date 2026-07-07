const config = require("../config");

/**
 * Submit a video generation task to RunningHub API.
 */
async function submitTask(prompt, imageBase64 = null, options = {}) {
  const providerConfig = config.PROVIDERS.runninghub;
  if (!providerConfig.apiKey || providerConfig.apiKey.startsWith("your_")) {
    return { success: false, error: "RunningHub API Key belum diatur di file .env." };
  }

  const model = options.model || providerConfig.defaultModel;
  const ratio = options.ratio || config.defaultAspectRatio;
  const resolution = options.resolution || config.defaultResolution;
  const duration = options.duration === "auto" ? "5" : options.duration;

  const payload = {
    prompt,
    resolution,
    duration,
    ratio,
    generateAudio: true,
  };

  if (imageBase64) {
    payload.image = imageBase64;
  }

  try {
    const response = await fetch(`${providerConfig.apiBase}/${model}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${providerConfig.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (data.taskId) {
      return { success: true, taskId: data.taskId };
    } else {
      const errorMsg = data.errorMessage || data.message || data.detail || JSON.stringify(data);
      return { success: false, error: errorMsg };
    }
  } catch (err) {
    return { success: false, error: `Network error: ${err.message}` };
  }
}

/**
 * Poll task status from RunningHub API.
 */
async function pollTask(taskId) {
  const providerConfig = config.PROVIDERS.runninghub;

  try {
    const response = await fetch(`${providerConfig.apiBase}/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${providerConfig.apiKey}`,
      },
      body: JSON.stringify({ taskId }),
    });

    const data = await response.json();

    let status = "unknown";
    if (data.status === "SUCCESS" || data.status === "succeeded" || data.status === "completed") {
      status = "succeeded";
    } else if (data.status === "RUNNING" || data.status === "processing") {
      status = "running";
    } else if (data.status === "QUEUED" || data.status === "pending") {
      status = "queued";
    } else if (data.status === "FAILED" || data.status === "failed") {
      status = "failed";
    }

    let progress = null;
    if (data.progress !== undefined && data.progress !== null) {
      progress = data.progress;
    }

    return {
      status,
      content: data,
      error: data.errorMessage || data.error || null,
      progress,
    };
  } catch (err) {
    return { status: "error", error: `Network error: ${err.message}` };
  }
}

/**
 * Extract video URL from RunningHub response.
 */
function findVideoUrl(obj) {
  if (!obj || typeof obj !== "object") return null;

  if (Array.isArray(obj.results)) {
    for (const r of obj.results) {
      if (r.url && typeof r.url === "string" && r.url.startsWith("http")) return r.url;
    }
  }

  if (Array.isArray(obj.output)) {
    for (const item of obj.output) {
      if (typeof item === "string" && item.startsWith("http")) return item;
    }
  }

  if (obj.output && typeof obj.output === "string" && obj.output.startsWith("http")) return obj.output;
  if (obj.video_url) return obj.video_url;
  if (obj.url && typeof obj.url === "string" && obj.url.startsWith("http")) return obj.url;

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const result = findVideoUrl(obj[key]);
      if (result) return result;
    }
  }

  return null;
}

module.exports = {
  submitTask,
  pollTask,
  findVideoUrl,
};
