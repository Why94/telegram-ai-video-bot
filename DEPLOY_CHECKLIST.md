# Deploy Checklist — AI Video Bot (Leonardo AI Only)

Bot sudah siap. Ikuti langkah ini sebelum publikasikan.

## 1. Railway Setup
- [ ] Deploy dari GitHub (branch `master` auto-deploy).
- [ ] **Tambah Volume**: Mount Path = `/data` (WAJIB — supaya DB akun & saldo tidak hilang tiap restart).
- [ ] Atau set env `INVENTORY_DB_PATH=/data/inventory.db`.
- [ ] Set `PORT=3000` (webhook server Xendit).

## 2. Environment Variables (Railway → Variables)
Wajib:
- [ ] `TELEGRAM_BOT_TOKEN` — token dari @BotFather
- [ ] `ADMIN_USER_IDS` — id Telegram admin (pisah koma), contoh: `123456789`
- [ ] `INVENTORY_ENCRYPTION_KEY` — **ganti dari default** `change_me_...` (string acak panjang, simpan aman)
- [ ] `LEONARDO_CREDIT_COST=2000` — biaya per generate (credit)
- [ ] `ALLOWED_ACCOUNT_PRODUCTS=Leonardo AI` — hanya produk ini yg dijual

Manual Payment (sambil nunggu Xendit):
- [ ] `CREDIT_RATE_IDR=1000` — 1 credit = Rp1000
- [ ] `MANUAL_DANA=08xxxxxxxxx`
- [ ] `MANUAL_OVO=08xxxxxxxxx`
- [ ] `MANUAL_BCA=xxxxxxxxxx`
- [ ] `MANUAL_PAYMENT_ADMIN=@admin_username`

Opsional:
- [ ] `INVENTORY_LOW_STOCK=10` — threshold notif stok menipis
- [ ] `XENDIT_API_KEY` + `XENDIT_WEBHOOK_TOKEN` — kosongkan dulu (mode manual aktif). Isi kalau sudah verifikasi bisnis.

## 3. Import Akun Leonardo (via Bot)
1. Admin ketik `/admin` → 📥 Upload CSV.
2. Format CSV (lihat `data/templates/leonardo_import_example.csv`):
   ```
   product_name,email,password,recovery_email,recovery_password,profile_name,country,plan,expire_date,notes,status,price,api_key
   Leonardo AI,acc1@gmail.com,password1,,,Leonardo 1,Indonesia,Monthly,2026-12-31,Ready,AVAILABLE,50rb,sk-leonardo-apikey-1-xxxx
   ```
3. **Kolom `api_key` WAJIB** — generate pakai key itu, bukan global. Tanpa ini generate gagal "stok habis".
4. Leonardo.ai TIDAK support login email/password via API → butuh API key per akun.

## 4. Verifikasi
- [ ] Client bisa `/start` → menu muncul.
- [ ] Client beli akun → dapet email/password, credit terpotong.
- [ ] Client generate video (provider Leonardo) → akun `IN_USE`, credit -2000.
- [ ] `/gencost` tampil saldo & biaya.
- [ ] Menu 💳 Top Up → pilih nominal → kirim bukti → admin dapat foto + `/addcredit`.
- [ ] Admin dapat notif "STOK AKUN MENIPIS" kalau stok < threshold.

## 5. Keamanan
- [ ] JANGAN commit `.env` (sudah di .gitignore? cek).
- [ ] `INVENTORY_ENCRYPTION_KEY` != default.
- [ ] `ADMIN_USER_IDS` hanya orang terpercaya.

## 6. Catatan Arsitektur
- Provider video: hanya `leonardo` `usable: true`, lainnya `false`.
- Generate image-to-video pakai API key per akun dari inventory (status `IN_USE`, bisa dipakai ulang).
- Credit bot (saldo `users`) yang berkurang saat generate, bukan kuota Leonardo.
- Xendit otomatis mati kalau key kosong → fallback manual.

## 7. Kalau ada error
- `stock habis` tapi akun ada → cek kolom `api_key` terisi & status `AVAILABLE`.
- Credit tidak berkurang → cek `LEONARDO_CREDIT_COST` & `deductCredit` (sudah diekspor).
- DB reset tiap restart → cek Volume `/data` di Railway.
