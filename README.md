# 🎬 Telegram AI Video Generator Bot

Bot Telegram yang menerima prompt dari pengguna, mengirimnya ke **BytePlus Seedance API** untuk generate video AI, lalu mengirim hasil video langsung ke chat Telegram.

## ✨ Fitur

- **Text-to-Video** — Kirim prompt teks, dapatkan video AI
- **Image-to-Video** — Kirim foto + caption untuk animasi dari gambar referensi
- **Multi-model** — Pilih antara Seedance Pro, Fast, atau Mini
- **Customizable** — Atur aspect ratio, durasi, dan audio per user
- **Real-time Status** — Update status langsung di chat saat proses berlangsung
- **Auto-delivery** — Video otomatis dikirim ke chat setelah selesai

## 📋 Prerequisites

- **Node.js** v18 atau lebih baru
- **Telegram Bot Token** — Buat melalui [@BotFather](https://t.me/BotFather)
- **BytePlus API Key** — Daftar di [BytePlus ModelArk](https://www.byteplus.com/) dan aktifkan Seedance 2.0

## 🚀 Instalasi

### 1. Clone/Download project

```bash
cd d:\Ai2
```

### 2. Install dependencies

```bash
npm install
```

### 3. Konfigurasi environment

Copy file template dan isi dengan API key Anda:

```bash
cp .env.example .env
```

Edit file `.env`:

```env
TELEGRAM_BOT_TOKEN=123456789:ABCdefGhIJKlmNoPQRsTUVwxyz
BYTEPLUS_API_KEY=your_byteplus_api_key_here
```

### 4. Jalankan bot

```bash
npm start
```

Atau dengan auto-restart saat file berubah:

```bash
npm run dev
```

## 🤖 Daftar Command

| Command | Deskripsi |
|---------|-----------|
| `/start` | Welcome message dan cara penggunaan |
| `/help` | Panduan lengkap |
| `/generate <prompt>` | Generate video dari prompt teks |
| `/settings` | Lihat pengaturan saat ini |
| `/model <provider>` | Ganti provider AI (byteplus, kling, hailuo, luma, runway, veo, replicate, runninghub) |
| `/ratio 16:9\|9:16\|1:1\|...` | Set aspect ratio |
| `/resolution 480p\|720p\|1080p\|4k` | Set resolusi video |
| `/duration auto\|4-15` | Set durasi video (detik) |

## 📸 Image-to-Video

Kirim **foto** ke bot dengan **caption** yang berisi prompt deskripsi:

1. Pilih foto di Telegram
2. Tambahkan caption: `"Zoom out slowly revealing a beautiful landscape"`
3. Kirim — bot akan menggunakan foto sebagai first frame

## ⚙️ Konfigurasi Lengkap (.env)

```env
# Required
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
BYTEPLUS_API_KEY=your_byteplus_api_key

# Optional — Default values shown
SEEDANCE_MODEL=dreamina-seedance-2-0-260128
DEFAULT_RESOLUTION=720p
DEFAULT_ASPECT_RATIO=16:9
DEFAULT_DURATION=auto
GENERATE_AUDIO=true
```

### Model Options

| Preset | Model ID | Keterangan |
|--------|----------|------------|
| `pro` | `dreamina-seedance-2-0-260128` | Kualitas terbaik |
| `fast` | `dreamina-seedance-2-0-fast-260128` | Lebih cepat |
| `mini` | `dreamina-seedance-2-0-mini-260615` | Hemat biaya |

## 🔧 Troubleshooting

| Masalah | Solusi |
|---------|-------|
| Bot tidak merespon | Pastikan `TELEGRAM_BOT_TOKEN` benar |
| Error "Missing API Key" | Pastikan file `.env` ada dan terisi |
| Task selalu gagal | Periksa API Key BytePlus dan saldo resource |
| Video tidak terkirim | File mungkin > 50MB, bot akan kirim link download |
| Timeout | Video generation bisa 1-5 menit, max 10 menit |

## 📁 Struktur Project

```
├── bot.js                  # Main bot entry point
├── lib/
│   ├── config.js           # Configuration loader
│   ├── seedance.js         # BytePlus Seedance API wrapper
│   └── telegram-helpers.js # Telegram helper functions
├── package.json
├── .env                    # API keys (gitignored)
├── .env.example            # Template
├── .gitignore
└── README.md
```

## 📜 License

MIT
