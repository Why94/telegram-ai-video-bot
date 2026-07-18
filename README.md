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

## 🛠️ Admin Panel — Bulk Account Inventory

Modul manajemen inventory akun digital (Leonardo AI, ChatGPT Plus, Canva, Netflix, dll).
Diakses via Telegram oleh user yang terdaftar di `ADMIN_USER_IDS`.

### Commands
| Command | Deskripsi |
|---------|-----------|
| `/admin` | Buka Admin Panel (menu lengkap) |
| `/invsearch email=.. product=.. status=AVAILABLE` | Cari/filter akun |
| `/invbulk delete 1,2,3` | Bulk delete |
| `/invbulk disable 1,2,3` | Bulk disable |
| `/invbulk enable 1,2,3` | Bulk enable |
| `/invbulk status SOLD 1,2,3` | Ubah status massal |
| `/invbulk move 'New Product' 1,2,3` | Pindah produk |

### Upload & Import
- Kirim file **CSV / XLSX** lewat menu `📥 Upload` (max 100MB / 100k baris).
- Kolom: `product_name, email, password, recovery_email, recovery_password, profile_name, country, plan, expire_date, notes, status`.
- Auto: deteksi format, validasi header & email, skip baris kosong, dedupe, **enkripsi password (AES-256-GCM)**, batch insert, laporan import + error report.
- Saat upload, pilih **Skip / Replace / Cancel** untuk email yang sudah ada.

### Fitur
Dashboard stats, products, import history, search/filter, pagination, export CSV/Excel,
duplicate checker, bulk actions, template download, dan **audit log** untuk tiap aksi.

### Purchase Integration (hooks)
Fungsi siap-pasang untuk store: `reserveAccount()` → `deliverAccount()` (atomik),
`releaseAccount()` (bila pembayaran expire). Password **tidak pernah di-log**.

### Environment Variables
```env
ADMIN_USER_IDS=123456789            # comma-separated Telegram user IDs
INVENTORY_ENCRYPTION_KEY=xxxx        # long random secret (wajib, enkripsi password)
INVENTORY_DB_PATH=./data/inventory.db # opsional
INVENTORY_LOW_STOCK=10               # threshold warning per product
```

### Persistence (Railway)
Railway filesystem bersifat ephemeral — DB reset tiap deploy/restart. Mount **Railway Volume**
ke `/data` agar `inventory.db` awet. Secara otomatis modul menggunakan `/data/inventory.db`
saat `RAILWAY_ENVIRONMENT` terdeteksi.

## 📁 Struktur Project

```
├── bot.js                  # Main bot entry point
├── lib/
│   ├── config.js           # Configuration loader
│   ├── seedance.js         # BytePlus Seedance API wrapper
│   ├── telegram-helpers.js # Telegram helper functions
│   └── inventory/          # Admin Panel inventory module
│       ├── db.js           # sql.js DB, schema, AES encryption, audit log
│       ├── parser.js       # CSV/XLSX detect, validate, dedupe
│       ├── service.js      # import/export/search/bulk/stats/hooks
│       ├── template.js     # CSV/Excel template generator
│       └── admin.js        # Telegram admin UI & handlers
├── package.json
├── .env                    # API keys (gitignored)
├── .env.example            # Template
├── .gitignore
└── README.md
```

## 📜 License

MIT
