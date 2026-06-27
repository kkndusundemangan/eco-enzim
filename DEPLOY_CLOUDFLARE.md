# Deploy ke Cloudflare Pages

Panduan singkat untuk meng-host landing page statis ini di Cloudflare Pages.

Prasyarat
- Akun Cloudflare (daftar di https://dash.cloudflare.com)
- Akses ke repositori Git (GitHub/GitLab/Bitbucket) — Cloudflare Pages terintegrasi dengan repo publik atau privat.

Langkah 1 — Inisialisasi Git repo (jika belum)
```bash
cd path/to/your/project # e:\ammar\KKN
git init
git add .
git commit -m "Initial commit: landing page eco enzim"
# hubungkan ke GitHub/GitLab/Bitbucket dan push
```

Langkah 2 — Push ke GitHub
- Buat repository baru di GitHub (mis. `eco-enzim-demangan`).
- Ikuti petunjuk GitHub untuk menambahkan remote dan push.

Langkah 3 — Buat Project Cloudflare Pages
1. Login ke https://dash.cloudflare.com
2. Pilih menu **Pages** > **Create a project**
3. Pilih repository GitHub/GitLab/Bitbucket Anda dan berikan izin akses jika diminta.
4. Tentukan branch (mis. `main` atau `master`).
5. Build settings: karena ini static HTML/CSS/JS tanpa build step, kosongkan build command dan atur `Build output directory` ke `.` (root project), atau biarkan kosong jika Cloudflare menerima default.

Langkah 4 — Deploy
- Klik **Save and Deploy**. Cloudflare akan menarik repository dan menerbitkan situs.
- Setelah build selesai, akan muncul URL deploy sementara seperti `https://project-name.pages.dev`.

Langkah 5 — Custom domain (opsional)
1. Di dashboard Pages, buka project Anda > Custom domains > Add custom domain.
2. Masukkan nama domain Anda (mis. `www.example.com`).
3. Ikuti instruksi: tambahkan record CNAME/ALIAS atau ubah nameserver di registrar Anda ke Cloudflare.

Langkah 6 — Aktifkan admin online
Agar panel admin bisa menyimpan perubahan ke publik, tambahkan environment variables di Cloudflare Pages:
- `GITHUB_TOKEN` = token GitHub dengan akses repo (fine-grained atau classic PAT)
- `GITHUB_OWNER` = nama pengguna atau organisasi GitHub Anda
- `GITHUB_REPO` = nama repository Anda
- `GITHUB_BRANCH` = branch yang dipakai, misalnya `main`
- `CONTENT_FILE_PATH` = `data/content.json`

Setelah environment variables disimpan, deploy ulang project. Setelah itu, halaman admin bisa menyimpan teks dan gambar yang dipilih ke file JSON di repository Anda.

Catatan penting
- Jika Anda ingin perubahan gambar persist (tanpa edit HTML), upload file gambar baru ke repo dan push ke branch yang dipakai Cloudflare.
- Untuk perubahan cepat saat testing, jalankan live server lokal dulu.

Butuh saya buatkan file `.gitignore` atau menyiapkan repo GitHub untuk Anda? Jika mau, saya bisa commit dan push (butuh akses).