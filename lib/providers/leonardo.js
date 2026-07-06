const config = require("../config");

const API_BASE = "https://cloud.leonardo.ai/api/rest/v2";
const API_BASE_V1 = "https://cloud.leonardo.ai/api/rest/v1";

function ratioToDimensions(ratio) {
  const map = {
    "16:9": { width: 1280, height: 720 },
    "9:16": { width: 720, height: 1280 },
    "1:1": { width: 832, height: 832 },
    "4:3": { width: 832, height: 640 },
    "3:4": { width: 640, height: 832 },
    "21:9": { width: 1280, height: 544 },
  };
  return map[ratio] || { width: 1280, height: 720 };
}

async function uploadImage(imageBase64) {
  const providerConfig = config.PROVIDERS.leonardo;

  const ext = imageBase64.startsWith("data:image/png") ? "png" : "jpg";
  const rawData = imageBase64.split(",")[1] || imageBase64;

  const initRes = await fetch(`${API_BASE_V1}/init-image`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${providerConfig.apiKey}`,
    },
    body: JSON.stringify({ extension: ext }),
  });

  const initData = await initRes.json();
  const { id: imageId, url: presignedUrl, fields } = initData.uploadInitImage;

  const parsedFields = typeof fields === "string" ? JSON.parse(fields) : fields;

  const buffer = Buffer.from(rawData, "base64");
  const blob = new Blob([buffer], { type: `image/${ext}` });

  const formData = new FormData();
  for (const [key, val] of Object.entries(parsedFields)) {
    formData.append(key, val);
  }
  formData.append("file", blob, `image.${ext}`);

  await fetch(presignedUrl, { method: "POST", body: formData });

  return imageId;
}

async function submitTask(prompt, imageBase64 = null, options = {}) {
  const providerConfig = config.PROVIDERS.leonardo;
  if (!providerConfig.apiKey || providerConfig.apiKey.startsWith("your_")) {
    return { success: false, error: "Leonardo AI API Key belum diatur di file .env." };
  }

  const model = options.model || providerConfig.defaultModel;
  const ratio = options.ratio || config.defaultAspectRatio;
  const dims = ratioToDimensions(ratio);

  const params = {
    prompt,
    quantity: 1,
    width: dims.width,
    height: dims.height,
    frameInterpolation: true,
    promptEnhance: false,
    public: false,
  };

  if (imageBase64) {
    try {
      const imageId = await uploadImage(imageBase64);
      params.guidances = {
        start_frame: [
          {
            image: {
              id: imageId,
              type: "UPLOADED",
            },
          },
        ],
      };
    } catch (err) {
      return { success: false, error: `Gagal upload gambar: ${err.message}` };
    }
  }

  const payload = {
    model,
    parameters: params,
  };

  try {
    const response = await fetch(`${API_BASE}/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${providerConfig.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (data.generationId) {
      return { success: true, taskId: data.generationId };
    }

    const errorMsg = data.message || data.error?.message || JSON.stringify(data);
    return { success: false, error: errorMsg };
  } catch (err) {
    return { success: false, error: `Network error: ${err.message}` };
  }
}

async function pollTask(taskId) {
  const providerConfig = config.PROVIDERS.leonardo;
  try {
    const response = await fetch(`${API_BASE_V1}/generations/${taskId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${providerConfig.apiKey}`,
      },
    });

    const data = await response.json();
    const gen = data.generations_by_pk;

    if (!gen) {
      return { status: "unknown", content: data, error: null };
    }

    const statusMap = {
      COMPLETE: "succeeded",
      FAILED: "failed",
      PENDING: "queued",
      PROCESSING: "running",
      IN_PROGRESS: "running",
      QUEUED: "queued",
    };

    const resolvedStatus = statusMap[gen.status] || gen.status?.toLowerCase() || "unknown";

    let progress = null;
    if (resolvedStatus === "running" && gen.percentageComplete !== undefined) {
      progress = gen.percentageComplete;
    } else if (resolvedStatus === "running" && gen.progress !== undefined) {
      progress = gen.progress;
    }

    let previewUrl = null;
    if (gen.generated_images && Array.isArray(gen.generated_images)) {
      for (const img of gen.generated_images) {
        if (img.motionMP4URL || img.motionURL || img.url) {
          previewUrl = img.motionMP4URL || img.motionURL || img.url;
          break;
        }
      }
    }

    return {
      status: resolvedStatus,
      content: gen,
      error: gen.status === "FAILED" ? "Generation failed on Leonardo AI" : null,
      progress,
      previewUrl,
    };
  } catch (err) {
    return { status: "error", error: `Network error: ${err.message}` };
  }
}

function findVideoUrl(obj) {
  if (!obj || typeof obj !== "object") return null;

  if (obj.generated_images && Array.isArray(obj.generated_images)) {
    for (const img of obj.generated_images) {
      if (img.motionMP4URL) return img.motionMP4URL;
      if (img.motionURL) return img.motionURL;
      if (img.url) return img.url;
    }
  }

  if (obj.motionMP4URL) return obj.motionMP4URL;
  if (obj.motionURL) return obj.motionURL;
  if (obj.url && typeof obj.url === "string") return obj.url;

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
