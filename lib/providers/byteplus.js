const config = require("../config");

const API_BASE = "https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks";

/**
 * Submit a video generation task to BytePlus Seedance API.
 */
async function submitTask(prompt, imageBase64 = null, options = {}) {
  const providerConfig = config.PROVIDERS.byteplus;
  if (!providerConfig.apiKey || providerConfig.apiKey.startsWith("your_")) {
    return { success: false, error: "BytePlus API Key belum diatur di file .env." };
  }

  const model = options.model || providerConfig.defaultModel;
  const ratio = options.ratio || config.defaultAspectRatio;
  const resolution = options.resolution || config.defaultResolution;
  const duration = options.duration || config.defaultDuration;
  const generateAudio = options.generateAudio !== undefined ? options.generateAudio : config.generateAudio;

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
    return { success: false, error: "Prompt atau gambar referensi tidak boleh kosong." };
  }

  const payload = {
    model: model,
    content: content,
    generate_audio: generateAudio,
    ratio: ratio,
    resolution: resolution,
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
        Authorization: `Bearer ${providerConfig.apiKey}`,
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
 * Poll task status.
 */
async function pollTask(taskId) {
  const providerConfig = config.PROVIDERS.byteplus;
  try {
    const response = await fetch(`${API_BASE}/${taskId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${providerConfig.apiKey}`,
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
 * Extract video URL.
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
    if (obj.video_url && typeof obj.video_url === "string") return obj.video_url;
    if (obj.video_url && obj.video_url.url) return obj.video_url.url;
    if (obj.url && typeof obj.url === "string" && (obj.url.includes(".mp4") || obj.url.includes("sign="))) {
      return obj.url;
    }

    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const result = findVideoUrl(obj[key]);
        if (result) return result;
      }
    }
  }

  return null;
}

module.exports = {
  submitTask,
  pollTask,
  findVideoUrl,
};
