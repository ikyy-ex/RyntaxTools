// Fungsi bantu bersama untuk semua Netlify Function
export const env = k => (process.env[k] || '').trim();

export const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
});

// Tolak panggilan dari situs lain, supaya kuota API Anda tidak dipakai orang lain lewat browser
export function sameSite(req) {
  const site = req.headers.get('sec-fetch-site');
  if (site) return site === 'same-origin' || site === 'none';
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try { return new URL(origin).host === new URL(req.url).host; } catch { return false; }
}

// Pembatas sederhana per IP. Hanya berlaku per instance fungsi (perlindungan dasar).
const hits = new Map();
export function limited(context, name, max, windowMs = 60000) {
  const key = name + ':' + ((context && context.ip) || '?'), now = Date.now();
  const list = (hits.get(key) || []).filter(t => now - t < windowMs);
  list.push(now); hits.set(key, list);
  if (hits.size > 5000) hits.clear();
  return list.length > max;
}

// Pemeriksaan umum: metode, asal, dan batas permintaan
export function guard(req, context, name, method, max) {
  if (req.method !== method) return json({ error: 'Metode tidak diizinkan.' }, 405);
  if (!sameSite(req)) return json({ error: 'Asal permintaan ditolak.' }, 403);
  if (limited(context, name, max)) return json({ error: 'Terlalu banyak permintaan. Coba lagi sebentar.' }, 429);
  return null;
}
