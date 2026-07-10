# Alur Presentasi (PowerPoint): Menjelaskan Website — User & Admin

Petunjuk singkat: tiap slide singkat (judul + 2–4 poin), fokus pada fitur, alur penggunaan, dan tugas admin. Waktu rekomendasi keseluruhan: 6–8 menit.

1. Slide Judul
- Judul: Demo Web — Eco Enzim (Penjelasan Situs)
- Subjudul: Tujuan: cara pakai untuk User & Admin
- Visual: logo situs

2. Target Pengguna & Peran
- Headline: Siapa pengguna web?
- Poin: Pengunjung (mencari info), Admin (mengelola konten)
- Catatan pembicara: jelaskan singkat perbedaan peran (15s)

3. Struktur Halaman (navigasi)
- Headline: Halaman utama & panel admin
- Poin: `index.html` (tampilan publik), `admin.html` (login admin)
- Visual: screenshot mini peta situs

4. Konten yang Bisa Diedit (User-facing)
- Headline: Elemen yang dapat diedit di halaman publik
- Poin singkat: judul hero, subteks, tombol CTA, teks sektion, gambar galeri, footer
- Catatan: tunjukkan contoh elemen dengan highlight (20s)

5. Alur Editing untuk Admin
- Langkah ringkas: Masuk `admin.html` → klik "Buka Mode Edit Teks" → ubah elemen → simpan
- Poin: tombol edit, toolbar rich-text, input gambar (preview)

6. Penyimpanan & Sinkronisasi
- Headline: Di mana perubahan disimpan?
- Poin: `localStorage` (preview), `data/content.json` sebagai sumber dasar, dan endpoint `functions/api/save-content.js` untuk menyimpan (Cloudflare)
- Catatan: jelaskan fallback lokal jika jaringan mati (15s)

7. Fitur Simpan & Reset
- Poin: tombol "Simpan Semua Perubahan"; progress bar; pesan status
- Poin: tombol "Reset" menghapus preview lokal dan logout admin

8. Upload Gambar & Preview
- Headline: Cara ganti gambar
- Poin: pilih file → preview di halaman → disimpan ke `state.images` dan localStorage

9. Keamanan & Batasan
- Poin: Admin mode memakai sessionStorage dan query param demo; jangan simpan rahasia di klien
- Poin: Sesi demo (password), validasi sederhana, simpan server-side diperlukan untuk produksi

10. Alur Troubleshooting Singkat
- Poin: jika edit tidak muncul: tekan Reset → refresh
- Poin: cek console untuk error network; gunakan admin login ulang

11. Tugas Admin Harian (ringkas)
- Poin: perbarui teks hero, galeri foto, embed YouTube, simpan, verifikasi di perangkat lain

12. CTA & Kontak Teknis
- Poin: kontak pengembang/admin untuk masalah teknis, link repo atau docs internal

Catatan presentasi: gunakan screenshot singkat, panah untuk menunjukkan tombol, dan teks minimal pada slide; berikan catatan pembicara 1–2 kalimat untuk tiap slide.

File ini fokus menjelaskan fungsi situs, alur penggunaan bagi user dan admin, serta langkah teknis singkat tanpa membahas detail Eco Enzim itu sendiri.

