const config = require("../config");

/**
 * Submit a video generation task to Replicate AI.
 */
async function submitTask(prompt, imageBase64 = null, options = {}) {
  const providerConfig = config.PROVIDERS.replicate;
  if (!providerConfig.apiKey || providerConfig.apiKey.startsWith("your_")) {
    return { success: false, error: "Replicate API Key belum diatur di file .env." };
  }

  const model = options.model || providerConfig.defaultModel;

  const payload = {
    input: {
      prompt: prompt,
    },
  };

  if (imageBase64) {
    payload.input.image = imageBase64;
  }

  try {
    const response = await fetch(`${providerConfig.apiBase}/models/${model}/predictions`, {
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
      const errorMsg = data.detail || data.error?.message || JSON.stringify(data);
      return { success: false, error: errorMsg };
    }
  } catch (err) {
    return { success: false, error: `Network error: ${err.message}` };
  }
}

/**
 * Poll task status from Replicate AI.
 */
async function pollTask(taskId) {
  const providerConfig = config.PROVIDERS.replicate;

  try {
    const response = await fetch(`${providerConfig.apiBase}/predictions/${taskId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${providerConfig.apiKey}`,
      },
    });

    const data = await response.json();

    let status = "unknown";
    if (data.status === "succeeded") {
      status = "succeeded";
    } else if (data.status === "processing" || data.status === "starting") {
      status = "running";
    } else if (data.status === "queued") {
      status = "queued";
    } else if (data.status === "failed" || data.status === "canceled") {
      status = "failed";
    }

    let progress = null;
    if (status === "running" && data.metrics?.predict_time) {
      progress = Math.min(Math.round((data.metrics.predict_time / 60) * 100), 99);
    }

    return {
      status: status,
      content: data,
      error: data.error || null,
      progress,
    };
  } catch (err) {
    return { status: "error", error: `Network error: ${err.message}` };
  }
}

/**
 * Extract video URL.
 */
function findVideoUrl(obj) {
  if (!obj || typeof obj !== "object") return null;

  if (Array.isArray(obj.output)) {
    for (const item of obj.output) {
      if (typeof item === "string" && (item.startsWith("http"))) {
        return item;
      }
    }
  }

  if (typeof obj.output === "string" && obj.output.startsWith("http")) {
    return obj.output;
  }

  if (obj.video_url) return obj.video_url;
  if (obj.url) return obj.url;

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
