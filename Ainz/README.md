# Setoran Staff — Pengganti Google Form untuk Tim Scanlation

Aplikasi web sederhana untuk mencatat setoran kerja tim scanlation (seperti absen kerja).
Tidak ada upload file — hanya pencatatan setoran. Dirancang mobile-first karena
pemilik proyek utamanya memakai HP.

## Fitur

- **Halaman staff (`/`)** — tanpa login: pilih nickname, judul, chapter (mendukung
  desimal seperti `12.5`), lalu pilih **satu tugas** dari dropdown (dikelompokkan
  per grup, mis. TL). Ada layar konfirmasi, riwayat 20 setoran terakhir, dan cegah
  duplikat. Satu submit = satu setoran.
- **Halaman admin (`/admin`)** — login terpisah. Kelola staff/judul/tugas, kelola
  daftar setoran (edit & hapus), rekap bulanan, rekap per staff, dan ekspor CSV
  (UTF-8 dengan BOM, rapi di Excel/Sheets).
- **Stack**: Cloudflare Pages + Pages Functions + D1 (SQLite), frontend
  HTML/CSS/JS vanilla tanpa build step. Muat di tier gratis Cloudflare
  (staff < 20, judul < 50).
- Zona waktu laporan memakai **Asia/Jakarta (UTC+7)**; waktu disimpan UTC.

## Struktur proyek

```
/
├── public/               # Frontend statis (folder output Cloudflare Pages)
│   ├── index.html        # Halaman staff
│   ├── admin.html        # Halaman admin
│   ├── style.css         # Gaya + dark mode otomatis
│   ├── app.js            # Logika halaman staff
│   └── admin.js          # Logika halaman admin
├── functions/            # Pages Functions (backend)
│   ├── _utils.js         # Helper bersama (validasi, rate limit, zona waktu)
│   ├── _admin_session.js # Helper sesi admin (HMAC, cookie, login)
│   └── api/
│       ├── staff.js, titles.js, tasks.js       # Daftar master aktif
│       ├── staff/[id]/riwayat.js               # Riwayat 20 terakhir
│       ├── submissions.js                       # POST setoran (publik)
│       └── admin/
│           ├── login.js, logout.js, me.js       # Autentikasi
│           ├── staff.js, titles.js, tasks.js     # CRUD master + toggle
│           ├── staff/[id].js, titles/[id].js, tasks/[id].js   # update
│           ├── staff/[id]/toggle.js, titles/[id]/toggle.js, tasks/[id]/toggle.js
│           ├── submissions.js                     # CRUD setoran
│           ├── submissions/[id].js                # detail/edit/hapus
│           ├── rekap-bulanan.js, rekap-per-staff.js
│           └── submissions/csv.js, rekap-bulanan/csv.js, rekap-per-staff/csv.js
├── schema.sql            # Skema D1 (ditempel ke D1 Console)
└── README.md
```

## Cara deploy (dari HP, lewat dashboard Cloudflare)

Semua langkah ini bisa dilakukan di browser HP. Tidak perlu terminal, wrangler,
atau build lokal.

### 1. Push proyek ke GitHub
- Repo: `https://github.com/tamvanpr/ainzreport` (branch `main`).
- Isi aplikasi berada di dalam folder `Ainz/`: `Ainz/public/`,
  `Ainz/functions/`, `Ainz/schema.sql`, dan `Ainz/README.md`.
- Saat connect ke Pages nanti, set **Root directory** = `Ainz`
  dan **Build output directory** = `public`.

### 2. Buat database D1
- Buka dashboard Cloudflare → **Storage & Databases** → **D1** → **Create**.
- Beri nama (mis. `setoran-staff-db`). Catat `database_id`-nya.

### 3. Jalankan skema
- Di halaman D1 yang baru dibuat, buka tab **Console** (atau **D1 Console**).
- Tempel isi `schema.sql`. Jika tidak bisa sekali jalan, tempel **per statement**
  (tiap blok `CREATE TABLE` / `CREATE INDEX` / `INSERT`). Pastikan semua berstatus
  sukses.

### 4. Buat project Pages (connect ke Git)
- **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → pilih repo.
- Isi form:
  - **Production branch**: `main`.
  - **Root directory**: `Ainz` (karena isi aplikasi ada di folder ini).
  - **Build command**: _biarkan kosong_ (tanpa build step).
  - **Build output directory**: `public`
- Klik **Deploy site**. Tunggu sampai deploy sukses.

### 5. Bind database D1
- Buka project Pages barunya → **Settings** → **Bindings** → **Add** → **D1 database**.
  - **Variable name**: `DB` (harus persis `DB`).
  - Pilih D1 `setoran-staff-db` yang tadi.

### 6. Isi variabel & secret
- Masih di project Pages → **Settings** → **Variables and Secrets** (atau **Environment**).
- Tambahkan variabel:
  - `ADMIN_PASSWORD` = kata sandi admin pilihanmu.
  - `SESSION_SECRET` = string acak panjang (mis. hasil `openssl rand -hex 32`
    atau salin 32+ karakter acak).
- Simpan.

### 7. Redeploy
- Kembali ke tab **Deployments** → **Redeploy from branch** (atau deploy ulang).
- Binding D1 dan variabel hanya terbaca setelah redeploy.

### 8. Tambah data pertama lewat `/admin`
- Buka URL proyek → `/admin`, masuk dengan `ADMIN_PASSWORD`.
- Tab **Data**: tambah staff, judul, dan tugas (atau atur grup seperti `TL`).
- Tugas bawaan (ETL/KTL/CTL/JPL grup TL, TS, Solo) sudah di-seed di skema.

## Konfigurasi (di dashboard, jangan di kode)

| Item              | Lokasi                                   | Keterangan                                   |
|-------------------|------------------------------------------|----------------------------------------------|
| `DB`              | Settings → Bindings → D1 database        | Nama binding D1 (wajib `DB`).                |
| `ADMIN_PASSWORD`  | Settings → Variables and Secrets         | Kata sandi login admin.                      |
| `SESSION_SECRET`  | Settings → Variables and Secrets         | Kunci HMAC untuk cookie sesi (string acak).  |

> **Jangan** membuat `wrangler.toml`. Binding dan secret diatur lewat dashboard.

## Masalah umum

- **Binding `DB` tidak terbaca / error 500 "Database belum terhubung"**:
  Pastikan binding bernama persis `DB`, dan kamu sudah **redeploy** setelah
  menambahnya. Coba buka endpoint `/api/staff` untuk mendiagnosis.
- **Schema belum dijalankan**: jika tabel belum ada, semua query gagal.
  Pastikan semua statement di `schema.sql` sudah sukses di D1 Console
  (cek tabel `staff`, `titles`, `task_types`, `submissions`, `rate_limits` ada).
- **Lupa redeploy setelah mengubah variabel/binding**: perubahan `ADMIN_PASSWORD`,
  `SESSION_SECRET`, atau binding D1 **wajib** di-redeploy agar aktif.
- **Dropdown tugas di halaman staff kosong**: buka `/api/tasks` di browser.
  Seharusnya muncul array berisi ETL/KTL/CTL/JPL/TS/Solo. Kalau array-nya kosong,
  berarti `schema.sql` belum dijalankan (seed tugas belum masuk) atau semua tugas
  dinonaktifkan dari `/admin`. Endpoint ini sudah hanya mengembalikan tugas aktif.
- **`/admin` minta login terus-terusan**: cek `SESSION_SECRET` terisi dan
  redeploy. Jika baru login, pastikan cookie tidak diblokir (pakai situs desktop).

## Tips

- **Aktifkan "Situs desktop" di browser HP** bila tabel admin terasa sempit:
  di Chrome/HP, ketuk ikon menu (⋮) → **Situs desktop** (atau *Request desktop site*).
- Tabel rekap di layar kecil bisa **digeser horizontal** (swipe kiri-kanan).
- Dark mode mengikuti pengaturan sistem HP/browser secara otomatis.
- Password admin sebaiknya panjang dan acak; simpan di password manager.

## Catatan keamanan

- Semua query memakai **prepared statement (bind)**.
- Setiap nilai dinamis di-**escape** dengan `escapeHtml()`, dan seluruh penulisan
  HTML melewati helper `setHtml` dengan **Trusted Types policy** khusus template
  buatan sendiri (tag tetap render sebagai elemen, bukan teks).
- **CSP** ketat (`script-src 'self'`, `object-src 'none'`, `base-uri 'none'`,
  `frame-ancestors 'none'`) plus `X-Content-Type-Options`, `Referrer-Policy`,
  `Permissions-Policy`, `COOP`, `CORP`, dan HSTS — diatur di `public/_headers`
  dan pada semua respons API.
- Cookie sesi memakai prefix `__Host-` dengan `HttpOnly; Secure; SameSite=Lax;
  Path=/`, ditandatangani HMAC, berlaku 7 hari. Logout mengirim
  `Clear-Site-Data: "cookies", "storage", "cache"`.
- Password admin dibandingkan **constant-time** (`crypto.subtle.timingSafeEqual`).
- **Rate limit** sederhana (tabel D1, hash IP) pada `POST /api/submissions`
  (10/menit per IP) dan login admin (5 per 5 menit per IP).
- Data master hanya dinonaktifkan, tidak dihapus — rekap lama tetap utuh.
