// Ryntax Pinterest: cari foto & video inspirasi dari Pexels (bukan Pinterest). GET /api/pinterest?q=
import { env, json, guard } from '../lib/util.mjs';

export default async (req, context) => {
  const no = guard(req, context, 'pinterest', 'GET', 15); if (no) return no;
  const key = env('PEXELS_API_KEY'); if (!key) return json({ error: 'PEXELS_API_KEY belum diisi.' }, 503);
  const q = (new URL(req.url).searchParams.get('q') || '').trim().slice(0, 100);
  if (!q) return json({ error: 'Kata kunci kosong.' }, 400);
  const get = async (path, n) => {
    const r = await fetch('https://api.pexels.com/' + path + '?' + new URLSearchParams({ query: q, per_page: String(n), locale: 'id-ID' }), { headers: { Authorization: key }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(r.status);
    return r.json();
  };
  const [f, v] = await Promise.allSettled([get('v1/search', 18), get('videos/search', 6)]);
  if (f.status !== 'fulfilled' && v.status !== 'fulfilled') return json({ error: 'Pexels gagal dihubungi.' }, 502);
  return json([
    ...(f.value?.photos || []).map(p => ({ title: p.alt || 'Foto', desc: 'Foto: ' + p.photographer + ' · Pexels', thumb: p.src?.medium || '', url: p.url })),
    ...(v.value?.videos || []).map(p => ({ title: 'Video', desc: 'Video: ' + (p.user?.name || '-') + ' · Pexels', thumb: p.image || '', url: p.url }))
  ]);
};

export const config = { path: '/api/pinterest' };
