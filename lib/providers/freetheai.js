const config = require("../config");

async function submitTask(prompt, imageBase64 = null, options = {}) {
  const providerConfig = config.PROVIDERS.freetheai;
  if (!providerConfig.apiKey || providerConfig.apiKey.startsWith("your_")) {
    return { success: false, error: "FreeTheAi API Key belum diatur. Dapatkan key via Discord /signup." };
  }

  const duration = Math.max(1, Math.min(5, parseInt(options.duration) || 5));

  const payload = {
    model: "xai/grok-imagine-video",
    prompt: prompt,
    duration: duration,
    resolution: "480p",
    aspect_ratio: options.ratio || "16:9",
  };

  try {
    const response = await fetch(`${providerConfig.apiBase}/v1/videos/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${providerConfig.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const httpStatus = response.status;
    const data = await response.json();

    // Handle error responses
    if (httpStatus >= 400) {
      const errCode = data.error?.code || data.error || httpStatus;
      const errMsg = data.error?.message || data.message || JSON.stringify(data);
      return { success: false, error: `[${errCode}] ${errMsg}` };
    }

    const requestId = data.id || data.request_id;

    // Immediate result (some responses return video_url directly)
    const videoUrl = data.video_url || data.url || data.video?.url;
    if (videoUrl) {
      return { success: true, taskId: requestId || "direct", videoUrl };
    }

    if (requestId) {
      return { success: true, taskId: requestId };
    }

    return { success: false, error: JSON.stringify(data) };
  } catch (err) {
    return { success: false, error: `Network error: ${err.message}` };
  }
}

async function pollTask(taskId) {
  const providerConfig = config.PROVIDERS.freetheai;

  try {
    const response = await fetch(`${providerConfig.apiBase}/v1/videos/${taskId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${providerConfig.apiKey}`,
      },
    });

    const data = await response.json();

    // xAI API uses { status: "done", video: { url: "..." } }
    if (data.video?.url) {
      return { status: "succeeded", content: data };
    }
    if (data.video_url || data.url) {
      return { status: "succeeded", content: data };
    }
    if (data.status === "done" || data.status === "completed" || data.status === "succeeded") {
      return { status: "succeeded", content: data };
    }

    if (data.status === "failed" || data.error) {
      return { status: "failed", error: data.error?.message || data.error || "Generation failed" };
    }

    // FreeTheAi uses { status: "pending", progress: 0 }
    if (data.status === "pending" || data.progress !== undefined) {
      return { status: "running", content: data, progress: data.progress };
    }

    return { status: "running", content: data };
  } catch (err) {
    return { status: "error", error: `Network error: ${err.message}` };
  }
}

function findVideoUrl(obj) {
  if (!obj || typeof obj !== "object") return null;

  // xAI format: { video: { url: "..." } }
  if (obj.video?.url && typeof obj.video.url === "string") return obj.video.url;

  // Direct fields
  if (obj.video_url && typeof obj.video_url === "string") return obj.video_url;
  if (obj.url && typeof obj.url === "string" && obj.url.startsWith("http")) return obj.url;

  // Recursive search
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
