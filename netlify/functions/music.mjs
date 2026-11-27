// Ryntax Music: cari lagu + preview 30 detik (iTunes Search API). GET /api/music?q=
import { json, guard } from '../lib/util.mjs';

export default async (req, context) => {
  const no = guard(req, context, 'music', 'GET', 20); if (no) return no;
  const q = (new URL(req.url).searchParams.get('q') || '').trim().slice(0, 100);
  if (!q) return json({ error: 'Kata kunci kosong.' }, 400);
  try {
    const r = await fetch('https://itunes.apple.com/search?' + new URLSearchParams({ term: q, media: 'music', entity: 'song', country: 'ID', limit: '24' }), { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return json({ error: 'iTunes gagal (' + r.status + ').' }, 502);
    return json(((await r.json()).results || []).filter(t => t.previewUrl).map(t => ({
      title: t.trackName, desc: t.artistName + ' · preview iTunes', thumb: (t.artworkUrl100 || '').replace('100x100', '300x300'), audio: t.previewUrl, url: t.trackViewUrl
    })));
  } catch { return json({ error: 'iTunes tidak merespons.' }, 504); }
};

export const config = { path: '/api/music' };
