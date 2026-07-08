const config = require("../config");

const API_BASE = "https://gen.pollinations.ai";

const pendingTasks = new Map();

const RES_MAP = {
  "480p": { w: 854, h: 480 },
  "720p": { w: 1280, h: 720 },
  "1080p": { w: 1920, h: 1080 },
  "4k": { w: 3840, h: 2160 },
};

function getDimensions(resolution, ratio) {
  const base = RES_MAP[resolution] || RES_MAP["720p"];
  if (!ratio || ratio === "16:9") return { width: base.w, height: base.h };
  if (ratio === "9:16") return { width: base.h, height: base.w };
  if (ratio === "1:1") return { width: base.h, height: base.h };
  if (ratio === "4:3") return { width: Math.round(base.h * 4 / 3), height: base.h };
  if (ratio === "3:4") return { width: base.h, height: Math.round(base.h * 4 / 3) };
  if (ratio === "21:9") return { width: Math.round(base.h * 21 / 9), height: base.h };
  return { width: base.w, height: base.h };
}

function getDefaultDuration(model) {
  const map = {
    veo: 6,
    "seedance-2.0": 8,
    wan: 8,
    "wan-fast": 6,
    "grok-video-pro": 8,
    "nova-reel": 12,
    "ltx-2": 8,
  };
  return map[model] || 8;
}

async function uploadImage(imageBase64) {
  const raw = imageBase64.split(",")[1] || imageBase64;
  const buffer = Buffer.from(raw, "base64");

  const formData = new FormData();
  const blob = new Blob([buffer], { type: "image/jpeg" });
  formData.append("file", blob, "image.jpg");

  const response = await fetch(`${API_BASE}/upload`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Upload gagal: HTTP ${response.status}${text ? " - " + text.slice(0, 200) : ""}`);
  }

  const data = await response.json();
  return data.url || `https://media.pollinations.ai/${data.hash}`;
}

async function startGeneration(prompt, imageBase64, options) {
  const providerConfig = config.PROVIDERS.pollinations;
  const apiKey = providerConfig.apiKey;
  const model = options.model || providerConfig.defaultModel;

  let imageUrl = null;
  if (imageBase64) {
    imageUrl = await uploadImage(imageBase64);
  }

  const dims = getDimensions(options.resolution, options.ratio);
  const duration = options.duration && options.duration !== "auto"
    ? parseInt(options.duration, 10)
    : getDefaultDuration(model);

  const params = new URLSearchParams();
  params.set("model", model);
  params.set("width", dims.width);
  params.set("height", dims.height);
  params.set("duration", duration);
  if (imageUrl) params.set("image", imageUrl);
  if (options.ratio) params.set("aspectRatio", options.ratio);
  if (options.generateAudio) params.set("audio", "true");

  let url = `${API_BASE}/video/${encodeURIComponent(prompt)}?${params.toString()}`;
  if (apiKey && !apiKey.startsWith("your_")) {
    url += `&key=${encodeURIComponent(apiKey)}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000);

  try {
    const response = await fetch(url, { method: "GET", signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status}${text ? " - " + text.slice(0, 300) : ""}`);
    }

    const finalUrl = response.url;
    return { videoUrl: finalUrl };
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

async function submitTask(prompt, imageBase64 = null, options = {}) {
  const taskId = `pl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  pendingTasks.set(taskId, startGeneration(prompt, imageBase64, options)
    .then(result => ({ success: true, ...result }))
    .catch(err => ({ success: false, error: err.message }))
  );

  return { success: true, taskId };
}

async function pollTask(taskId) {
  const promise = pendingTasks.get(taskId);
  if (!promise) return { status: "failed", error: "Task not found" };

  const raceResult = await Promise.race([
    promise.then(result => ({ done: true, result })),
    new Promise(resolve => setTimeout(() => resolve({ done: false }), 1500)),
  ]);

  if (raceResult.done) {
    pendingTasks.delete(taskId);
    const r = raceResult.result;
    if (r.success) {
      return { status: "succeeded", content: r };
    }
    return { status: "failed", error: r.error };
  }

  return { status: "running" };
}

function findVideoUrl(obj) {
  if (!obj || typeof obj !== "object") return null;
  return obj.videoUrl || obj.url || null;
}

module.exports = { submitTask, pollTask, findVideoUrl };
