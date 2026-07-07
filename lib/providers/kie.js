const config = require("../config");

function findUrlInResponse(obj) {
  if (!obj || typeof obj !== "object") return null;
  if (typeof obj === "string") {
    if (obj.startsWith("http://") || obj.startsWith("https://")) return obj;
    return null;
  }
  for (const key of ["fileUrl", "url", "file_url", "videoUrl", "imageUrl", "downloadUrl", "path"]) {
    if (typeof obj[key] === "string" && (obj[key].startsWith("http://") || obj[key].startsWith("https://"))) {
      return obj[key];
    }
  }
  for (const val of Object.values(obj)) {
    const result = findUrlInResponse(val);
    if (result) return result;
  }
  return null;
}

async function uploadImage(apiKey, base64DataUri) {
  // Strip data URI prefix if present (e.g. "data:image/jpeg;base64,")
  let rawBase64 = base64DataUri;
  if (rawBase64.includes(";base64,")) {
    rawBase64 = rawBase64.split(";base64,")[1];
  }

  const response = await fetch("https://kieai.redpandaai.co/api/file-base64-upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      base64Data: rawBase64,
      uploadPath: "telegram-bot",
    }),
  });

  const data = await response.json();
  console.log("KIE upload response:", JSON.stringify(data));

  const fileUrl = findUrlInResponse(data);
  if (fileUrl) {
    return fileUrl;
  }
  throw new Error((data.msg || data.message || "Image upload succeeded but no URL found") + " | full response: " + JSON.stringify(data).substring(0, 200));
}

async function submitTask(prompt, imageBase64 = null, options = {}) {
  const providerConfig = config.PROVIDERS.kie;
  if (!providerConfig.apiKey || providerConfig.apiKey.startsWith("your_")) {
    return { success: false, error: "KIE API Key belum diatur. Daftar di https://kie.ai untuk 80 credits gratis." };
  }

  let model = options.model || providerConfig.defaultModel;
  const isI2V = model === "grok-imagine/image-to-video" || !!imageBase64;
  if (isI2V && model !== "grok-imagine/image-to-video") {
    model = "grok-imagine/image-to-video";
  }
  const duration = Math.max(6, Math.min(30, parseInt(options.duration) || 6));

  let payload;

  if (isI2V && imageBase64) {
    let imageUrl;
    try {
      imageUrl = await uploadImage(providerConfig.apiKey, imageBase64);
    } catch (err) {
      return { success: false, error: `Gagal upload gambar: ${err.message}` };
    }

    payload = {
      model: "grok-imagine/image-to-video",
      input: {
        image_urls: [imageUrl],
        prompt: prompt,
        aspect_ratio: options.ratio || "16:9",
        duration: duration,
        resolution: options.resolution || "480p",
        mode: "normal",
      },
    };
  } else {
    payload = {
      model: model,
      input: {
        prompt: prompt,
        aspect_ratio: options.ratio || "16:9",
        duration: duration,
        resolution: options.resolution || "480p",
        mode: "normal",
      },
    };
  }

  try {
    const response = await fetch(`${providerConfig.apiBase}/api/v1/jobs/createTask`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${providerConfig.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (data.code === 200 && data.data?.taskId) {
      return { success: true, taskId: data.data.taskId };
    }

    const errorMsg = data.msg || data.error || JSON.stringify(data);
    return { success: false, error: errorMsg };
  } catch (err) {
    return { success: false, error: `Network error: ${err.message}` };
  }
}

async function pollTask(taskId) {
  const providerConfig = config.PROVIDERS.kie;

  try {
    const response = await fetch(
      `${providerConfig.apiBase}/api/v1/jobs/recordInfo?taskId=${taskId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${providerConfig.apiKey}`,
        },
      }
    );

    const data = await response.json();

    if (data.code !== 200) {
      return { status: "error", error: data.msg || "Query failed" };
    }

    const task = data.data;
    const state = task.state || task.status;

    if (state === "success") {
      return { status: "succeeded", content: task };
    }

    if (state === "fail" || state === "failed") {
      return { status: "failed", error: task.failMsg || "Generation failed" };
    }

    if (state === "wait" || state === "queueing") {
      return { status: "queued", content: task };
    }

    return { status: "running", content: task };
  } catch (err) {
    return { status: "error", error: `Network error: ${err.message}` };
  }
}

function findVideoUrl(obj) {
  if (!obj || typeof obj !== "object") return null;

  if (obj.videoInfo?.videoUrl) return obj.videoInfo.videoUrl;
  if (obj.video_url) return obj.video_url;
  if (obj.url) return obj.url;
  if (obj.videoInfo?.imageUrl) return obj.videoInfo.imageUrl;

  if (obj.resultJson) {
    try {
      const parsed = typeof obj.resultJson === "string" ? JSON.parse(obj.resultJson) : obj.resultJson;
      if (parsed.resultUrls?.length) return parsed.resultUrls[0];
    } catch {}
  }

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      if (key === "videoUrl" && typeof obj[key] === "string") return obj[key];
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
