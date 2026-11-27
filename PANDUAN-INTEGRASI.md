# Panduan Deploy Ryntax Tools (Netlify)

## Tool yang memakai file JS server

| Tool | File (netlify/functions) | Variabel yang diisi |
|---|---|---|
| Ryntax AI dan tool tulis AI | gemini.mjs | GEMINI_API_KEY (opsional GEMINI_MODEL) |
| Hapus Background (via API) | rembg.mjs | REMOVEBG_API_KEY |
| Get Code HTML (proxy) | proxy.mjs | tidak ada |
| Panel TEST API (?admin) | health.mjs | tidak ada |
| Foto ke Link, File ke Link, upload video | upload.mjs, file.mjs | tidak ada (Netlify Blobs) |
| Teks ke Suara (unduh MP3) | tts.mjs | GOOGLE_TTS_API_KEY |
| Ryntax Tube (cari) | tube.mjs | YOUTUBE_API_KEY |
| QRIS Payment Generator | qris.mjs | MIDTRANS_SERVER_KEY, MIDTRANS_PRODUCTION, MIDTRANS_ACQUIRER, STATIC_QRIS_PAYLOAD |

`netlify/lib/util.mjs` dipakai bersama dan wajib ikut diunggah.

## Cara deploy

Jangan pakai seret-dan-lepas (Netlify Drop). Gunakan salah satu:

**A. Lewat GitHub:** unggah isi folder ini ke repository, lalu di Netlify pilih
Add new project > Import an existing project.

**B. Lewat Netlify CLI (di komputer):**

    npm install
    npx netlify-cli deploy --prod

Setelah itu isi variabel di Project configuration > Environment variables,
lalu deploy ulang. Jangan menulis kunci di file HTML.

## Memeriksa

Buka `https://domain-anda/?admin` lalu tekan TEST API. Panel ini hanya menguji
permintaan nyata untuk Gemini. Tool lain uji langsung dari halamannya.

## Catatan

- QRIS: mulai dengan Server Key **Sandbox** (MIDTRANS_PRODUCTION=false). Channel QRIS
  harus aktif di akun Midtrans. Siapa pun yang membuka situs dapat membuat tagihan.
- Upload: maksimal 4 MB. Siapa pun yang punya tautan bisa membuka file, dan belum
  ada hapus otomatis. Hapus lewat menu Blobs di Netlify.
- Gemini, remove.bg, Google TTS, dan YouTube punya kuota/biaya. Pembatas permintaan
  di kode hanya perlindungan dasar; pasang batas pemakaian di akun penyedia.
- Login Google diatur terpisah lewat FIREBASE_CONFIG di public/index.html.
