const dotenv = require("dotenv");
const path = require("path");

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

/**
 * Validate that at least the Telegram Token is set.
 */
function validateEnv() {
  if (!process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN.startsWith("your_")) {
    console.error("❌ Missing TELEGRAM_BOT_TOKEN in environment variables.");
    process.exit(1);
  }
}

validateEnv();

/**
 * Available Provider & Model Presets
 */
const PROVIDERS = {
  byteplus: {
    name: "BytePlus Seedance",
    apiKey: process.env.BYTEPLUS_API_KEY,
    defaultModel: "dreamina-seedance-2-0-260128",
    models: {
      pro: "dreamina-seedance-2-0-260128",
      fast: "dreamina-seedance-2-0-fast-260128",
      mini: "dreamina-seedance-2-0-mini-260615"
    }
  },
  kling: {
    name: "Kling AI",
    apiKey: process.env.KLING_API_KEY,
    apiBase: process.env.KLING_API_BASE || "https://api.klingapi.com",
    defaultModel: "kling-v2.6-pro",
    models: {
      pro: "kling-v2.6-pro",
      standard: "kling-v2.6-std",
      turbo: "kling-v2.5-turbo"
    }
  },
  hailuo: {
    name: "Hailuo / MiniMax",
    apiKey: process.env.MINIMAX_API_KEY,
    apiBase: process.env.MINIMAX_API_BASE || "https://api.minimax.chat/v1",
    defaultModel: "hailuo-v2",
    models: {
      pro: "hailuo-v2",
      standard: "hailuo-v1"
    }
  },
  luma: {
    name: "Luma Dream Machine",
    apiKey: process.env.LUMA_API_KEY,
    apiBase: process.env.LUMA_API_BASE || "https://api.lumalabs.ai/dream-machine/v1",
    defaultModel: "ray-2",
    models: {
      ray2: "ray-2",
      ray1: "ray-1"
    }
  },
  runway: {
    name: "Runway",
    apiKey: process.env.RUNWAY_API_KEY,
    apiBase: process.env.RUNWAY_API_BASE || "https://api.runwayml.com/v1",
    defaultModel: "gen4.5",
    models: {
      gen4: "gen4.5",
      gen3: "gen3-alpha"
    }
  },
  veo: {
    name: "Google Veo",
    apiKey: process.env.GOOGLE_VEO_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS,
    defaultModel: "veo-3.1-generate-001",
    models: {
      veo31: "veo-3.1-generate-001",
      veo31Fast: "veo-3.1-fast-generate-001",
      veo30: "veo-3.0-generate-001",
      veo30Fast: "veo-3.0-fast-generate-001",
      veo2: "veo-2.0-generate-001"
    }
  },
  leonardo: {
    name: "Leonardo AI",
    apiKey: process.env.LEONARDO_API_KEY,
    defaultModel: "motion_2.0",
    models: {
      motion20: "motion_2.0",
      motion20Fast: "motion_2.0-fast"
    }
  },
  ernie: {
    name: "Baidu ERNIE Image Turbo",
    apiKey: process.env.ATLASCLOUD_API_KEY,
    defaultModel: "ernie-image-turbo",
    models: {
      turbo: "ernie-image-turbo"
    }
  },
  replicate: {
    name: "Replicate AI",
    apiKey: process.env.REPLICATE_API_KEY,
    apiBase: process.env.REPLICATE_API_BASE || "https://api.replicate.com/v1",
    defaultModel: "tencent/hunyuan-video",
    models: {
      hunyuan: "tencent/hunyuan-video",
      svd: "stabilityai/stable-video-diffusion",
      minimax: "minimax/video-01"
    }
  }
};

const ASPECT_RATIOS = ["16:9", "9:16", "21:9", "4:3", "3:4", "1:1"];
const RESOLUTIONS = ["480p", "720p", "1080p", "4k"];
const DURATIONS = ["auto", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"];
const MOTION_OPTIONS = [
  "none",
  "pan-left",
  "pan-right",
  "zoom-in",
  "zoom-out",
  "tilt-up",
  "tilt-down",
  "orbit"
];

const config = {
  telegramToken: process.env.TELEGRAM_BOT_TOKEN,
  defaultProvider: process.env.DEFAULT_PROVIDER || "byteplus",
  defaultResolution: process.env.DEFAULT_RESOLUTION || "720p",
  defaultAspectRatio: process.env.DEFAULT_ASPECT_RATIO || "16:9",
  defaultDuration: process.env.DEFAULT_DURATION || "auto",
  defaultMotion: process.env.DEFAULT_MOTION || "none",
  generateAudio: process.env.GENERATE_AUDIO !== "false",

  pollIntervalMs: 5000,
  maxWaitMs: 10 * 60 * 1000, // 10 minutes

  PROVIDERS,
  ASPECT_RATIOS,
  RESOLUTIONS,
  DURATIONS,
  MOTION_OPTIONS
};

module.exports = config;
