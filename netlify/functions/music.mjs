// Ryntax Music: cari lagu. GET /api/music?q=  dan  GET /api/music/stream?id=
// Prioritas: SoundCloud API resmi (lagu penuh, durasi asli). Fallback: iTunes (preview 30 dtk, durasi asli lagu tetap dikirim).
// Env (Netlify > Site settings > Environment variables): SOUNDCLOUD_CLIENT_ID, SOUNDCLOUD_CLIENT_SECRET
import { json, guard } from '../lib/util.mjs';

const env = k => (typeof Netlify !== 'undefined' && Netlify.env?.get(k)) || process.env[k] || '';
let tok = { v: '', exp: 0 };

async function scToken() {
  const id = env('SOUNDCLOUD_CLIENT_ID'), secret = env('SOUNDCLOUD_CLIENT_SECRET');
  if (!id || !secret) return '';
  if (tok.v && Date.now() < tok.exp) return tok.v;
  const r = await fetch('https://secure.soundcloud.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json; charset=utf-8' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret }),
    signal: AbortSignal.timeout(10000)
  });
  if (!r.ok) throw new Error('token ' + r.status);
  const d = await r.json();
  tok = { v: d.access_token, exp: Date.now() + Math.max(60, (d.expires_in || 3600) - 60) * 1000 };
  return tok.v;
}

async function soundcloud(q, token) {
  const r = await fetch('https://api.soundcloud.com/tracks?' + new URLSearchParams({ q, access: 'playable', limit: '24', linked_partitioning: 'true' }), {
    headers: { Authorization: 'OAuth ' + token, accept: 'application/json; charset=utf-8' }, signal: AbortSignal.timeout(10000)
  });
  if (!r.ok) throw new Error('search ' + r.status);
  const d = await r.json();
  return (Array.isArray(d) ? d : d.collection || []).filter(t => t.access === 'playable' && t.streamable !== false).map(t => ({
    title: t.title,
    desc: (t.user?.username || '') + ' · SoundCloud',
    thumb: (t.artwork_url || t.user?.avatar_url || '').replace('-large', '-t500x500'),
    audio: '/api/music/stream?id=' + t.id,
    url: t.permalink_url,
    duration: Math.round((t.duration || 0) / 1000), // detik, durasi asli lagu
    full: true
  }));
}

async function itunes(q) {
  const r = await fetch('https://itunes.apple.com/search?' + new URLSearchParams({ term: q, media: 'music', entity: 'song', country: 'ID', limit: '24' }), { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error('itunes ' + r.status);
  return ((await r.json()).results || []).filter(t => t.previewUrl).map(t => ({
    title: t.trackName,
    desc: t.artistName + ' · preview iTunes',
    thumb: (t.artworkUrl100 || '').replace('100x100', '300x300'),
    audio: t.previewUrl,
    url: t.trackViewUrl,
    duration: Math.round((t.trackTimeMillis || 0) / 1000), // durasi asli lagu
    previewDuration: 30,                                    // yang benar-benar diputar
    full: false
  }));
}

export default async (req, context) => {
  const no = guard(req, context, 'music', 'GET', 30); if (no) return no;
  const u = new URL(req.url);

  // Stream lagu penuh: redirect ke URL audio resmi SoundCloud (mendukung seek/Range).
  if (u.pathname.endsWith('/stream')) {
    const id = u.searchParams.get('id') || '';
    if (!/^\d{1,20}$/.test(id)) return json({ error: 'ID lagu tidak valid.' }, 400);
    try {
      const token = await scToken();
      if (!token) return json({ error: 'SoundCloud belum dikonfigurasi.' }, 503);
      const r = await fetch('https://api.soundcloud.com/tracks/' + id + '/stream', { headers: { Authorization: 'OAuth ' + token }, redirect: 'manual', signal: AbortSignal.timeout(10000) });
      const loc = r.headers.get('location');
      if (loc) return new Response(null, { status: 302, headers: { location: loc, 'cache-control': 'no-store' } });
      return json({ error: 'Lagu tidak bisa diputar penuh (' + r.status + ').' }, r.status === 401 || r.status === 403 || r.status === 404 ? r.status : 502);
    } catch { return json({ error: 'SoundCloud tidak merespons.' }, 504); }
  }

  const q = (u.searchParams.get('q') || '').trim().slice(0, 100);
  if (!q) return json({ error: 'Kata kunci kosong.' }, 400);
  try {
    const token = await scToken().catch(() => '');
    if (token) {
      try { const list = await soundcloud(q, token); if (list.length) return json(list); } catch { /* lanjut ke iTunes */ }
    }
    return json(await itunes(q));
  } catch (e) { return json({ error: 'Layanan musik tidak merespons.' }, 504); }
};

export const config = { path: ['/api/music', '/api/music/stream'] };
