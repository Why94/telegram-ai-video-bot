const config = require("../config");

const API_BASE = "https://api.atlascloud.ai";

function ratioToSize(ratio) {
  const map = {
    "1:1": "1024x1024",
    "16:9": "1376x768",
    "9:16": "768x1376",
    "4:3": "1200x896",
    "3:4": "896x1200",
    "21:9": "1264x848",
  };
  return map[ratio] || "1024x1024";
}

async function submitTask(prompt, imageBase64 = null, options = {}) {
  const providerConfig = config.PROVIDERS.ernie;
  if (!providerConfig.apiKey || providerConfig.apiKey.startsWith("your_")) {
    return { success: false, error: "ATLASCLOUD_API_KEY belum diatur di .env." };
  }

  try {
    const size = ratioToSize(options.ratio);

    const resp = await fetch(`${API_BASE}/api/v1/model/generateImage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${providerConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: "baidu/ERNIE-Image-Turbo/text-to-image",
        prompt: prompt,
        size: size,
        n: 1,
        seed: -1,
        use_pe: true,
        num_inference_steps: 8,
        guidance_scale: 1,
        enable_sync_mode: false,
        enable_base64_output: false,
      }),
    });

    const data = await resp.json();

    if (data.code === 200 && data.data?.id) {
      return { success: true, taskId: data.data.id };
    } else {
      return { success: false, error: data.message || data.error || JSON.stringify(data) };
    }
  } catch (err) {
    return { success: false, error: `Network error: ${err.message}` };
  }
}

async function pollTask(taskId) {
  try {
    const providerConfig = config.PROVIDERS.ernie;
    const resp = await fetch(`${API_BASE}/api/v1/model/prediction/${taskId}`, {
      headers: {
        Authorization: `Bearer ${providerConfig.apiKey}`,
      },
    });

    const data = await resp.json();
    const taskData = data.data || data;

    let status = "unknown";
    if (taskData.status === "completed" || taskData.status === "succeeded") {
      status = "succeeded";
    } else if (taskData.status === "processing" || taskData.status === "created") {
      status = "running";
    } else if (taskData.status === "failed") {
      status = "failed";
    }

    return {
      status: status,
      content: taskData,
      error: taskData.error || null,
      raw: data,
    };
  } catch (err) {
    return { status: "error", error: `Network error: ${err.message}` };
  }
}

function findVideoUrl(obj) {
  if (obj.url) return obj.url;
  if (Array.isArray(obj.outputs) && obj.outputs.length > 0) return obj.outputs[0];
  if (obj.output) return obj.output;
  return null;
}

module.exports = { submitTask, pollTask, findVideoUrl };
