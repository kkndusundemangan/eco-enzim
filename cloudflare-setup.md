# Setup Cloudflare Pages + Worker Save Function

## Tujuan
Membuat agar admin hanya perlu klik `Simpan sekarang`.
Cloudflare akan melakukan write ke GitHub menggunakan token yang disimpan aman di environment variable.

## File yang dibuat
- `functions/api/save-content.js`

## Bagian frontend yang berubah
- `assets/js/script.js`
  - sekarang mencoba POST ke `/api/save-content`
  - tidak lagi memerlukan token GitHub di browser
- `index.html`
  - tombol `Simpan sekarang` tetap sama

## Langkah deployment Cloudflare Pages
1. Pastikan repo sudah di GitHub.
2. Buat Cloudflare Pages project dari repo tersebut.
3. Atur `Root directory` ke `.` (root project).
4. Tambahkan build command kosong jika tidak diperlukan.
5. Pastikan `functions/` ada dalam repo.

## Environment variables yang diperlukan
Tambahkan di Cloudflare Pages project -> Settings -> Environment variables:
- `GITHUB_TOKEN` = token GitHub dengan izin `repo`
- `GITHUB_OWNER` = `kkndusundemangan` (atau nama akun Anda)
- `GITHUB_REPO` = `eco-enzim`
- `GITHUB_BRANCH` = `main`
- `CONTENT_FILE_PATH` = `data/content.json`

## Cara kerja function
1. Browser admin klik `Simpan sekarang`.
2. JS mengirim POST ke `/api/save-content`.
3. Cloudflare reads env vars and calls GitHub API:
   - GET file SHA dari `data/content.json`
   - PUT file baru ke GitHub
4. Jika berhasil, response dikembalikan ke browser.

## Testing lokal (opsional)
Cloudflare Pages mendukung build dan preview lokal dengan `wrangler`.
Tapi untuk saat ini jika Anda hanya menggunakan Pages, cukup deploy dan tes langsung.

## Catatan penting
- Jangan masukkan `GITHUB_TOKEN` di browser; Cloudflare function sudah menangani semua penulisan ke GitHub.
- Gambar permanen masih perlu push sebagai file ke repo jika Anda ingin tampil untuk semua pengunjung.
