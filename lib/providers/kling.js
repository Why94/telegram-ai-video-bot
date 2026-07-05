const config = require("../config");

/**
 * Submit a video generation task to Kling AI.
 */
async function submitTask(prompt, imageBase64 = null, options = {}) {
  const providerConfig = config.PROVIDERS.kling;
  if (!providerConfig.apiKey || providerConfig.apiKey.startsWith("your_")) {
    return { success: false, error: "Kling AI API Key belum diatur di file .env." };
  }

  const model = options.model || providerConfig.defaultModel;
  const ratio = options.ratio || config.defaultAspectRatio;
  const resolution = options.resolution || config.defaultResolution;
  const duration = options.duration === "auto" ? "5" : options.duration; // Kling supports 5 or 10
  
  // Choose standard endpoint or image2video
  const isImageToVideo = !!imageBase64;
  const endpoint = isImageToVideo 
    ? `${providerConfig.apiBase}/v1/videos/image2video`
    : `${providerConfig.apiBase}/v1/videos/text2video`;

  const payload = {
    model_name: model,
    prompt: prompt,
    duration: duration,
    aspect_ratio: ratio,
    resolution: resolution, // pass option resolution (e.g. 720p, 1080p)
  };

  if (isImageToVideo) {
    // Kling expects image as URL or base64. 
    // Depending on version, it may expect raw base64 or a field named 'image'.
    // We pass it in standard format.
    payload.image = imageBase64;
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${providerConfig.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (data.data?.task_id || data.task_id) {
      return { success: true, taskId: data.data?.task_id || data.task_id };
    } else {
      const errorMsg = data.message || data.error?.message || JSON.stringify(data);
      return { success: false, error: errorMsg };
    }
  } catch (err) {
    return { success: false, error: `Network error: ${err.message}` };
  }
}

/**
 * Poll task status from Kling AI.
 */
async function pollTask(taskId) {
  const providerConfig = config.PROVIDERS.kling;
  const endpoint = `${providerConfig.apiBase}/v1/videos/task/${taskId}`;

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${providerConfig.apiKey}`,
      },
    });

    const data = await response.json();
    const taskData = data.data || data;

    // Standard states: 'submitted', 'processing', 'succeeded', 'failed'
    let status = "unknown";
    if (taskData.task_status === "succeed" || taskData.status === "succeeded") {
      status = "succeeded";
    } else if (taskData.task_status === "processing" || taskData.status === "processing") {
      status = "running";
    } else if (taskData.task_status === "submitted" || taskData.status === "submitted" || taskData.status === "queued") {
      status = "queued";
    } else if (taskData.task_status === "failed" || taskData.status === "failed") {
      status = "failed";
    }

    return {
      status: status,
      content: taskData,
      error: taskData.task_status_msg || null,
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
  if (obj && obj.video_result?.url) return obj.video_result.url;
  if (obj && obj.url) return obj.url;
  
  if (obj && Array.isArray(obj.video_results)) {
    const res = obj.video_results[0];
    if (res && res.url) return res.url;
  }

  // Fallback recursive search
  if (obj !== null && typeof obj === "object") {
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        if (typeof obj[key] === "string" && obj[key].startsWith("http") && obj[key].includes(".mp4")) {
          return obj[key];
        }
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
