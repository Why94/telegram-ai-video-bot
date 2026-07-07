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
    usable: false,
    statusNote: "Butuh aktivasi model di Ark Console (perlu kartu kredit)",
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
    usable: false,
    statusNote: "Belum punya API key — daftar di klingai.com",
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
    usable: false,
    statusNote: "Belum punya API key — daftar di minimax.io",
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
    usable: false,
    statusNote: "Belum punya API key — daftar di lumalabs.ai",
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
    usable: false,
    statusNote: "API key ada tapi butuh billing aktif",
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
    usable: false,
    statusNote: "Belum punya API key — butuh Google Cloud",
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
    usable: false,
    statusNote: "Belum punya API key — daftar di leonardo.ai",
    apiKey: process.env.LEONARDO_API_KEY,
    defaultModel: "motion_2.0",
    models: {
      motion20: "motion_2.0",
      motion20Fast: "motion_2.0-fast"
    }
  },
  ernie: {
    name: "Baidu ERNIE Image Turbo",
    usable: false,
    statusNote: "Hanya untuk Text-to-Image, bukan video",
    apiKey: process.env.ATLASCLOUD_API_KEY,
    defaultModel: "ernie-image-turbo",
    models: {
      turbo: "ernie-image-turbo"
    }
  },
  replicate: {
    name: "Replicate AI",
    usable: false,
    statusNote: "API key ada tapi butuh billing (kartu kredit)",
    apiKey: process.env.REPLICATE_API_KEY,
    apiBase: process.env.REPLICATE_API_BASE || "https://api.replicate.com/v1",
    defaultModel: "tencent/hunyuan-video",
    models: {
      hunyuan: "tencent/hunyuan-video",
      svd: "stabilityai/stable-video-diffusion",
      minimax: "minimax/video-01"
    }
  },
  runninghub: {
    name: "RunningHub",
    usable: false,
    statusNote: "Saldo wallet kosong — isi saldo di runninghub.ai",
    apiKey: process.env.RUNNINGHUB_API_KEY,
    apiBase: process.env.RUNNINGHUB_API_BASE || "https://www.runninghub.ai/openapi/v2",
    defaultModel: "rhart-video/sparkvideo-2.0/text-to-video",
    models: {
      seedance: "rhart-video/sparkvideo-2.0/text-to-video",
      seedanceFast: "rhart-video/sparkvideo-2.0-fast/text-to-video",
      seedanceGlobal: "bytedance/seedance-2.0-global/text-to-video",
      wan27: "alibaba/wan-2.7/text-to-video"
    }
  },
  freetheai: {
    name: "FreeTheAi (Grok Video)",
    usable: true,
    statusNote: "Gratis! 480p max 5s. Jangan lupa /checkin tiap hari di Discord",
    apiKey: process.env.FREETHEAI_API_KEY,
    apiBase: process.env.FREETHEAI_API_BASE || "https://api.freetheai.xyz",
    defaultModel: "xai/grok-imagine-video",
    models: {
      grokVideo: "xai/grok-imagine-video"
    }
  },
  kie: {
    name: "KIE.ai (Multi Model)",
    usable: true,
    statusNote: "80 credits gratis — siap pakai! 🎉",
    apiKey: process.env.KIE_API_KEY,
    apiBase: process.env.KIE_API_BASE || "https://api.kie.ai",
    defaultModel: "grok-imagine/image-to-video",
    models: {
      grokT2V: "grok-imagine/text-to-video",
      grokI2V: "grok-imagine/image-to-video",
      seedance: "bytedance/v1-pro-text-to-video"
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
