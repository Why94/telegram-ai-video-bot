const config = require("../config");

async function submitTask(prompt, imageBase64 = null, options = {}) {
  const providerConfig = config.PROVIDERS.freetheai;
  if (!providerConfig.apiKey || providerConfig.apiKey.startsWith("your_")) {
    return { success: false, error: "FreeTheAi API Key belum diatur. Dapatkan key via Discord /signup." };
  }

  const payload = {
    model: "xai/grok-imagine-video",
    prompt: prompt,
    duration: 5,
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

    const data = await response.json();
    const requestId = data.id || data.request_id;

    if (data.video_url || data.url) {
      return { success: true, taskId: null, videoUrl: data.video_url || data.url };
    }

    if (requestId) {
      return { success: true, taskId: requestId };
    }

    const errorMsg = data.error?.message || data.error || JSON.stringify(data);
    return { success: false, error: errorMsg };
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

    if (data.video_url || data.url) {
      return { status: "succeeded", content: data };
    }

    if (data.status === "completed" || data.status === "succeeded") {
      return { status: "succeeded", content: data };
    }

    if (data.status === "failed" || data.error) {
      return { status: "failed", error: data.error || "Generation failed" };
    }

    if (data.progress !== undefined) {
      return { status: "running", content: data, progress: data.progress };
    }

    return { status: "running", content: data };
  } catch (err) {
    return { status: "error", error: `Network error: ${err.message}` };
  }
}

function findVideoUrl(obj) {
  if (!obj || typeof obj !== "object") return null;

  if (obj.video_url) return obj.video_url;
  if (obj.url) return obj.url;

  if (Array.isArray(obj.data)) {
    for (const item of obj.data) {
      if (item.url) return item.url;
    }
  }

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      if (key === "url" && typeof obj[key] === "string" && obj[key].startsWith("http")) {
        return obj[key];
      }
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
