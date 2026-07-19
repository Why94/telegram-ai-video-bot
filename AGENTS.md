# AI Video Generator Bot — Project Context

## Overview
Telegram bot (grammY) for AI video generation with multiple providers. Deployed on Railway, auto-deploys from GitHub master.

## Stack
- **Runtime:** Node.js >=18
- **Framework:** grammY v1.35+ (Telegram bot framework)
- **Deploy:** Railway (auto-deploy from GitHub master)
- **Config:** dotenv (.env gitignored, keys via Railway Variables)

## Working Provider
### 💜 KIE.ai (`lib/providers/kie.js`)
- **Status:** ✅ WORKING
- **API Key:** `df95df46e575a5650b1079f69ac388d2` (80 credits, ~8 videos)
- **Models:** `grok-imagine/text-to-video`, `grok-imagine/image-to-video`, `bytedance/v1-pro-text-to-video`
- **Default:** `grok-imagine/image-to-video`
- **Limits:** 480p-720p, 6-30s duration
- **I2V:** Yes — kirim foto dengan caption, auto-detect model
- **Auth:** Bearer token
- **Upload API:** `https://kieai.redpandaai.co/api/file-base64-upload` (POST, base64 data URI)
- **Task API:** `POST /api/v1/jobs/createTask`, `GET /api/v1/jobs/recordInfo?taskId=...`
- **Credit check:** https://kie.ai/logs

## Blocked Providers
| Provider | Key | Status |
|---|---|---|
| 🔷 BytePlus | Ada | Butuh aktivasi model (kartu kredit) |
| 🟡 Replicate | Ada | Butuh billing |
| 🔶 RunningHub | Ada | Saldo wallet 0 |
| 🟢 Hailuo | Placeholder | Belum ada key |
| 🔵 Luma | Placeholder | Belum ada key |
| 🟠 Runway | Ada | Butuh billing aktif |
| 🟤 Veo | Placeholder | Belum ada key |
| ⚪ Leonardo | Placeholder | Belum ada key |
| 🔴 ERNIE | Ada | Hanya image gen |
| 🆓 FreeTheAi | **Ada** | API video **tidak tersedia** (404) |

## Config Structure (`lib/config.js`)
Setiap provider punya field:
```js
providerKey: {
  name: "Display Name",
  usable: true/false,          // false = ❌ di model picker
  statusNote: "Alasan kenapa",  // muncul waktu diklik
  apiKey: process.env.XXX_API_KEY,
  apiBase: process.env.XXX_API_BASE || "https://...",
  defaultModel: "model-name",
  models: { key: "model-name", ... }
}
```

## Roadmap / Next Steps
### 1. Add GeminiGenAI provider
- Daftar di https://geminigen.ai → dapet API key
- Free tier: 40 credits, limited Veo-3.1-Fast & Sora-2
- API Max: $10/3.000 requests
- Base URL & endpoint: https://docs.geminigen.ai
- Webhook-based (result dikirim ke webhook URL)
- Tambah key `GEMINIGEN_API_KEY` di Railway Variables
- Buat file `lib/providers/geminigen.js`
- Daftar di `lib/providers/index.js`
- Set `usable: true` + `statusNote` di config

### 2. User settings persist
- Currently in-memory (`Map`) — hilang saat bot restart
- Bisa pake file JSON atau database ringan

### 3. Credit checker
- Tambah command `/credits` buat cek sisa credits KIE

## Key Files
| File | Purpose |
|---|---|
| `bot.js` | Main bot logic, menus, callbacks, handlers |
| `lib/config.js` | Provider configs, API keys, defaults |
| `lib/providers/index.js` | Provider registry, motion injection, polling |
| `lib/providers/kie.js` | KIE.ai implementation (T2V + I2V) |
| `lib/providers/freetheai.js` | FreeTheAi (broken, 404) |
| `lib/telegram-helpers.js` | Photo download, video send helpers |

## Important Notes
- **Jangan commit .env** — berisi API keys
- Railway Variables: `TELEGRAM_BOT_TOKEN`, `KIE_API_KEY`, dll
- Bot pake **Markdown** parse mode (bukan MarkdownV2)
- Motion control di-inject otomatis di `providers/index.js`
- KIE I2V auto-detect: kalo ada imageBase64, pake model grok-imagine/image-to-video
- ❌ di model picker = `usable: false`, klik muncul penjelasan

## ⚠️ CATATAN PENTING — Arsitektur Saat Ini (per 2026-07)
Bot ini SEKARANG dibatasi HANYA **Leonardo AI** (provider video & inventory akun):

### Provider Video
- Di `lib/config.js`: hanya `leonardo.usable = true`, semua provider lain `usable: false`.
- `defaultProvider = "leonardo"`.
- Menu model picker (`bot.js` `showModelPicker`) auto-loop hanya provider `usable: true`.

### Inventory Akun (dibeli client)
- `config.ALLOWED_ACCOUNT_PRODUCTS` default `"Leonardo AI"` — hanya produk ini yg tampil di Beli Akun.
- Set env `ALLOWED_ACCOUNT_PRODUCTS=Leonardo AI,Runway AI` (pisah koma) untuk nambah.

### Generate Image-to-Video (Leonardo)
- **MEKANISME:** Bot generate PAKAI API KEY TIAP AKUN Leonardo dari inventory (bukan 1 global key).
- Tiap akun Leonardo HARUS punya kolom `api_key` saat di-import (lihat `data/templates/leonardo_import_example.csv`).
- Leonardo.ai TIDAK punya login email/password via API — generate wajib pakai API key per akun.
- Alur: cek saldo → reserve akun `AVAILABLE` (status jadi `IN_USE`) → generate → potong credit tetap.
- Biaya generate FIXED: `config.LEONARDO_CREDIT_COST` (default 2000 credit), diatur env `LEONARDO_CREDIT_COST`.
- Fungsi kunci: `inventory.reserveLeonardoAccount(productName)`, `leonardo.js` terima `options.apiKey`.
- Command `/gencost` untuk cek saldo & biaya generate.

### Peringatan
- Jangan set `leonardo.usable = true` tanpa mengisi `api_key` di inventory → generate gagal.
- Akun yang dipakai generate ditandai `IN_USE` (bukan `SOLD`) — bisa dipakai ulang untuk generate berikutnya.
- Kolom `api_key` terenkripsi (AES-256-GCM) di DB, sama seperti password.

## Roadmap (update)
- ~~1. GeminiGenAI provider~~ (ditunda — fokus Leonardo dulu)
- User settings persist (masih in-memory `Map`, hilang saat restart)
- `/credits` sudah ada; `/gencost` baru ditambah

## Payment: Manual Mode (sambil nunggu verifikasi Xendit)
Saat Xendit belum aktif, top up pakai **mode manual**:
- Menu 💳 Top Up → `showManualTopUp()`: tampilkan rekening (`config.MANUAL_PAYMENT`) + pilih nominal.
- Client klik nominal → `topup_pick:<amount>` → diminta kirim bukti transfer (foto).
- Saat client kirim foto & punya state di `topupRequests` Map → foto di-forward ke semua admin + notify `/addcredit <user> <amount>`.
- Admin approve via `/addcredit` → saldo masuk.
- Env: `MANUAL_DANA`, `MANUAL_OVO`, `MANUAL_BCA`, `MANUAL_PAYMENT_ADMIN`, `CREDIT_RATE_IDR`, atau JSON `MANUAL_PAYMENT_INFO`.
- `/pay` (Xendit) otomatis mati kalau `XENDIT_API_KEY`/`XENDIT_WEBHOOK_TOKEN` kosong (fallback ke manual).
