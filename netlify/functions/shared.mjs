/* =====================================================================
   shared.mjs — Util bersama untuk tool Downloader
   (TikTok, Instagram, YouTube, Nokos)
   Kode diambil dari index.html milik Ryntax All Tools; perilaku
   tidak diubah. Satu file ini dipakai bersama keempat tool .mjs.
   ===================================================================== */

/* Endpoint backend. Kosong = mode placeholder (tombol menampilkan
   pesan "Endpoint belum diatur"). Isi URL backend masing-masing. */
export const ENDPOINTS = {
  instants: '', tiktok: '', instagram: '', youtube: '', nokos: '',
  tts: '/.netlify/functions/tts',
  foto: '/.netlify/functions/upload',
  file: '/.netlify/functions/upload',
  proxy: '/.netlify/functions/proxy?url=',
  rembg: '/.netlify/functions/rembg',
  gemini: '/.netlify/functions/gemini',
  resep: '', music: '',
  tube: '/.netlify/functions/tube',
  manga: '', bola: '', berita: '', clips: '', deploy: '', preset: '',
  bilibili: '', pinterest: '', npsn: '', drama: '', wacheck: '',
  qris: (typeof location !== 'undefined' && location.protocol !== 'file:') ? location.origin : ''
};

/* Escape HTML — sama persis dengan helper di index.html */
export const esc = s => String(s).replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* Validasi URL: wajib http(s) dan cocok dengan domain tool. */
export const urlRule = (re, name) => v =>
  !/^https?:\/\//i.test(v.url)
    ? 'Masukkan URL lengkap diawali https://'
    : !re.test(v.url)
      ? 'URL harus berasal dari ' + name + '.'
      : '';

/* Pembuat satu field input/select/textarea (verbatim dari index.html) */
const ctl = (f, p) => {
  const id = p + f.id;
  return '<div' + (f.area ? ' class="sm:col-span-2"' : '') +
    '><label for="' + id + '" class="block text-sm font-semibold mb-2">' + f.label + '</label>' +
    (f.opts
      ? '<select id="' + id + '" class="field">' + f.opts.map(o => {
          o = Array.isArray(o) ? o : [o, o];
          return '<option value="' + o[0] + '">' + o[1] + '</option>';
        }).join('') + '</select>'
      : f.area
        ? '<textarea id="' + id + '" class="field" rows="4" placeholder="' + (f.ph || '') + '">' + (f.val || '') + '</textarea>'
        : '<input id="' + id + '" class="field" ' + (f.attr || '') + ' placeholder="' + (f.ph || '') + '">') +
    '</div>';
};

export const fieldGrid = (fs, p) =>
  '<div class="grid sm:grid-cols-2 gap-4">' + fs.map(f => ctl(f, p)).join('') + '</div>';

/* =====================================================================
   createServiceTool(c) — pabrik tool layanan (endpoint eksternal).
   Bentuk tool yang dihasilkan sama persis dengan hasil serviceTool()
   di index.html sehingga bisa didaftarkan lewat registerTool(tool).
   ===================================================================== */
export function createServiceTool(c) {
  return {
    id: c.id,
    name: c.name,
    category: 'Downloader',
    badge: c.badge,
    description: c.description,
    keywords: c.keywords,
    icon: c.icon,

    mount(root) {
      root.innerHTML = fieldGrid(c.fields, 'sv-') +
        '<div class="mt-4"><button id="sv-go" class="btn btn-primary" type="button">' + c.action + '</button></div>' +
        '<p id="sv-status" class="text-sm mt-3 font-semibold" aria-live="polite"></p>' +
        '<h3 class="font-extrabold mt-5 mb-2">Riwayat</h3><ul id="sv-hist" class="grid gap-2"></ul>';

      const $ = s => root.querySelector(s);
      const KEY = 'alltools-hist-' + c.id;
      let hist = [];
      try { hist = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { hist = []; }

      const save = () => {
        try { localStorage.setItem(KEY, JSON.stringify(hist.slice(0, 15))); } catch (e) { /* abaikan */ }
      };

      function render() {
        $('#sv-hist').innerHTML = hist.length
          ? hist.slice(0, 15).map(h =>
              '<li class="stat text-sm"><b class="block break-all">' + esc(h.label) + '</b>' +
              '<span class="muted">' + esc(h.time) + ' · ' + esc(h.status) + '</span>' +
              (h.link ? ' <a class="underline font-bold" href="' + esc(h.link) + '" target="_blank" rel="noopener noreferrer">Buka hasil</a>' : '') +
              '</li>').join('')
          : '<li class="muted text-sm">Belum ada riwayat.</li>';
      }

      function log(label, status, link) {
        hist.unshift({ label: label, status: status, link: link || '', time: new Date().toLocaleString('id-ID') });
        save(); render();
      }

      $('#sv-go').addEventListener('click', async () => {
        const v = {};
        c.fields.forEach(f => { v[f.id] = $('#sv-' + f.id).value.trim(); });
        const err = c.validate ? c.validate(v) : '';
        const st = $('#sv-status');
        if (err) { st.style.color = '#d93a3a'; st.textContent = err; return; }

        const label = c.label(v);
        const ep = ENDPOINTS[c.key];
        if (!ep) {
          st.style.color = '#b86b00';
          st.textContent = 'Endpoint belum diatur (mode placeholder). Isi ENDPOINTS.' + c.key + ' di kode.';
          log(label, 'Menunggu endpoint');
          return;
        }
        st.style.color = 'inherit';
        st.textContent = 'Memproses...';
        try {
          const r = await fetch(ep, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(v)
          });
          const d = await r.json();
          if (!r.ok || d.status === 'error') throw new Error(d.message || 'Gagal');
          st.style.color = '#1f8a4c';
          st.textContent = 'Selesai' + (d.title ? ': ' + d.title : '');
          log(label, 'Selesai', /^https?:\/\//.test(d.download_url || '') ? d.download_url : '');
        } catch (e) {
          st.style.color = '#d93a3a';
          st.textContent = 'Gagal memproses. Periksa endpoint dan CORS.';
          log(label, 'Gagal');
        }
      });

      render();
    }
  };
}
