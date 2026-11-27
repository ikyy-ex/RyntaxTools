/* =====================================================================
   Ryntax Music — Netlify Function (Functions API v2, Node 18+)
   ---------------------------------------------------------------------
   Sumber musik LEGAL dengan streaming lagu PENUH:
     • Audius  (https://audius.org)  — API publik, tanpa API key.
       Lagu diunggah sendiri oleh artis; streaming penuh lewat endpoint
       resmi /v1/tracks/{id}/stream. Download hanya jika artis
       mengaktifkan "is_downloadable".
     • Jamendo (https://jamendo.com) — musik berlisensi Creative Commons.
       Butuh JAMENDO_CLIENT_ID (gratis di https://devportal.jamendo.com).
       Download hanya jika "audiodownload_allowed" = true.

   Endpoint (GET /.netlify/functions/ryntax-music):
     ?q=kata&type=all|track|artist|album|genre&src=all|audius|jamendo
                                  → { results:[Track], sources:{...} }
     ?trending=1[&genre=pop]      → { results:[Track], sources:{...} }
     ?stream=au:ID | ja:ID        → 302 ke URL audio segar (anti-kedaluwarsa)
     ?download=au:ID | ja:ID      → { allowed, url, filename }
     ?download=ID&proxy=1         → stream file asli + Content-Disposition
     ?health=1                    → { ok, audius, jamendo }

   Environment variable (Netlify → Site configuration → Environment variables):
     JAMENDO_CLIENT_ID  (opsional, tapi disarankan)
     AUDIUS_APP_NAME    (opsional, default "RyntaxMusic")
   ===================================================================== */

const APP = process.env.AUDIUS_APP_NAME || 'RyntaxMusic';
const JKEY = process.env.JAMENDO_CLIENT_ID || '';
const AU_ROOT = 'https://api.audius.co';
const MAX_PROXY = 19.5 * 1024 * 1024; // batas aman respons streaming Netlify

const GENRES = {
  pop: { au: 'Pop', ja: 'pop' }, rock: { au: 'Rock', ja: 'rock' }, 'hip-hop': { au: 'Hip-Hop/Rap', ja: 'hiphop' },
  electronic: { au: 'Electronic', ja: 'electronic' }, 'lo-fi': { au: 'Lo-Fi', ja: 'lofi' }, jazz: { au: 'Jazz', ja: 'jazz' },
  acoustic: { au: 'Acoustic', ja: 'acoustic' }, classical: { au: 'Classical', ja: 'classical' }, 'r&b': { au: 'R&B/Soul', ja: 'rnb' },
  ambient: { au: 'Ambient', ja: 'ambient' }, metal: { au: 'Metal', ja: 'metal' }, folk: { au: 'Folk', ja: 'folk' },
  reggae: { au: 'Reggae', ja: 'reggae' }, house: { au: 'House', ja: 'house' }, soundtrack: { au: 'Soundtrack', ja: 'soundtrack' },
  latin: { au: 'Latin', ja: 'latin' }, country: { au: 'Country', ja: 'country' }, blues: { au: 'Blues', ja: 'blues' },
  funk: { au: 'Funk', ja: 'funk' }, techno: { au: 'Techno', ja: 'techno' }
};
const ALIAS = { hiphop: 'hip-hop', rap: 'hip-hop', 'hip hop': 'hip-hop', lofi: 'lo-fi', 'lo fi': 'lo-fi', klasik: 'classical', akustik: 'acoustic', rnb: 'r&b', 'r and b': 'r&b', soul: 'r&b', elektronik: 'electronic', edm: 'electronic', dangdut: null };
const genreOf = q => { const k = String(q || '').trim().toLowerCase(); const a = k in ALIAS ? ALIAS[k] : k; return a && GENRES[a] ? GENRES[a] : null; };

/* ---------- utilitas ---------- */
const JSON_HEAD = { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' };
const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...JSON_HEAD, ...extra } });
const fail = (status, error, message) => json({ error, message }, status, { 'Cache-Control': 'no-store' });
async function tfetch(url, opt = {}, ms = 7000) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms);
  try { return await fetch(url, { ...opt, signal: ac.signal, headers: { 'User-Agent': 'RyntaxMusic/1.0', ...(opt.headers || {}) } }); }
  finally { clearTimeout(t); }
}
const parseId = v => { const m = String(v || '').match(/^(au|ja):([A-Za-z0-9]{1,40})$/); return m ? { src: m[1], id: m[2] } : null; };
const cleanName = s => String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'lagu';
const EXT = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/flac': 'flac', 'audio/x-flac': 'flac', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/aiff': 'aiff', 'audio/x-aiff': 'aiff', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac' };
function extOf(type, url) {
  const t = String(type || '').split(';')[0].trim().toLowerCase(); if (EXT[t]) return EXT[t];
  const m = String(url || '').split('?')[0].match(/\.(mp3|flac|wav|aiff?|ogg|m4a|aac)$/i); return m ? m[1].toLowerCase() : '';
}

/* ---------- Audius ---------- */
let AU_BASE = AU_ROOT; // host yang terakhir berhasil (cache per instance)
async function auHosts() {
  try { const r = await tfetch(AU_ROOT, {}, 4000); const d = await r.json(); const h = (d.data || []).filter(x => /^https:\/\//.test(x)); return h.sort(() => Math.random() - .5).slice(0, 2); }
  catch (e) { return []; }
}
async function au(path, params = {}) {
  const qs = new URLSearchParams({ ...params, app_name: APP }).toString();
  const tried = new Set();
  const attempt = async base => { tried.add(base); const r = await tfetch(base + '/v1' + path + '?' + qs); if (!r.ok) throw new Error('audius ' + r.status); const d = await r.json(); AU_BASE = base; return d.data; };
  try { return await attempt(AU_BASE); }
  catch (e) {
    for (const h of [AU_ROOT].concat(await auHosts())) { if (tried.has(h)) continue; try { return await attempt(h); } catch (e2) { /* host berikutnya */ } }
    throw e;
  }
}
function auTrack(t, album) {
  if (!t || !t.id || !t.title) return null;
  if (t.is_streamable === false || t.is_stream_gated || t.is_delete || t.is_unlisted) return null;
  const art = t.artwork || {};
  return {
    id: 'au:' + t.id, src: 'audius', title: t.title, artist: (t.user && (t.user.name || t.user.handle)) || '', album: album || '',
    genre: t.genre || '', duration: Math.round(t.duration || 0), cover: art['480x480'] || art['150x150'] || '', coverLg: art['1000x1000'] || art['480x480'] || '',
    dl: !!(t.is_downloadable && !t.is_download_gated), link: t.permalink ? 'https://audius.co' + t.permalink : '', license: ''
  };
}
const auList = (arr, album) => (Array.isArray(arr) ? arr : []).map(t => auTrack(t, album)).filter(Boolean);
async function audiusSearch(q, type) {
  if (type === 'artist') {
    const users = (await au('/users/search', { query: q, limit: 5 }) || []).filter(u => u.track_count > 0).slice(0, 2);
    if (users.length) { const lists = await Promise.all(users.map(u => au('/users/' + u.id + '/tracks', { limit: 25, sort: 'plays' }).catch(() => []))); const out = lists.flatMap(l => auList(l)); if (out.length) return out; }
  } else if (type === 'album') {
    const pls = await au('/playlists/search', { query: q, limit: 8 }) || []; const albums = (pls.filter(p => p.is_album).length ? pls.filter(p => p.is_album) : pls).slice(0, 2);
    const lists = await Promise.all(albums.map(p => au('/playlists/' + p.id + '/tracks').then(l => auList(l, p.playlist_name)).catch(() => [])));
    const out = lists.flat(); if (out.length) return out;
  } else if (type === 'genre') {
    const g = genreOf(q); if (g) return auList(await au('/tracks/trending', { genre: g.au, time: 'month' }));
  }
  return auList(await au('/tracks/search', { query: q, limit: 30 }));
}

/* ---------- Jamendo ---------- */
const JA_BASE = { limit: 30, include: 'musicinfo', audioformat: 'mp32', audiodlformat: 'mp32', imagesize: 300 };
async function ja(path, params = {}) {
  if (!JKEY) { const e = new Error('nokey'); e.code = 'nokey'; throw e; }
  const qs = new URLSearchParams({ client_id: JKEY, format: 'json', ...params }).toString();
  const r = await tfetch('https://api.jamendo.com/v3.0' + path + '/?' + qs); if (!r.ok) throw new Error('jamendo ' + r.status);
  const d = await r.json(); if (!d.headers || d.headers.status !== 'success') throw new Error('jamendo ' + ((d.headers && d.headers.error_message) || 'error'));
  return d.results || [];
}
function jaTrack(t) {
  if (!t || !t.id || !t.audio) return null;
  const img = t.album_image || t.image || '', g = t.musicinfo && t.musicinfo.tags && t.musicinfo.tags.genres;
  return {
    id: 'ja:' + t.id, src: 'jamendo', title: t.name, artist: t.artist_name || '', album: t.album_name || '', genre: (g && g[0]) || '',
    duration: Math.round(+t.duration || 0), cover: img, coverLg: img.replace(/([?&]width=)\d+/, '$1600'),
    dl: !!(t.audiodownload_allowed && t.audiodownload), link: t.shareurl || '', license: t.license_ccurl || ''
  };
}
const jaList = arr => arr.map(jaTrack).filter(Boolean);
async function jamendoSearch(q, type) {
  if (type === 'track') return jaList(await ja('/tracks', { ...JA_BASE, namesearch: q }));
  if (type === 'artist') { const l = jaList(await ja('/tracks', { ...JA_BASE, artist_name: q, order: 'popularity_total' })); if (l.length) return l; }
  if (type === 'album') { const l = jaList(await ja('/tracks', { ...JA_BASE, album_name: q })); if (l.length) return l; }
  if (type === 'genre') { const g = genreOf(q); return jaList(await ja('/tracks', { ...JA_BASE, fuzzytags: g ? g.ja : q.toLowerCase(), order: 'popularity_month' })); }
  return jaList(await ja('/tracks', { ...JA_BASE, search: q }));
}

/* ---------- gabungan ---------- */
function interleave(lists) {
  const out = [], seen = new Set(), max = Math.max(0, ...lists.map(l => l.length));
  for (let i = 0; i < max; i++) for (const l of lists) { const t = l[i]; if (!t) continue; const k = (t.title + '|' + t.artist).toLowerCase(); if (seen.has(t.id) || seen.has(k)) continue; seen.add(t.id); seen.add(k); out.push(t); }
  return out;
}
async function gather(jobs) {
  const names = Object.keys(jobs), res = await Promise.allSettled(names.map(n => jobs[n]())), sources = {}, lists = [];
  res.forEach((r, i) => { if (r.status === 'fulfilled') { sources[names[i]] = 'ok'; lists.push(r.value); } else sources[names[i]] = r.reason && r.reason.code === 'nokey' ? 'nokey' : 'error'; });
  return { results: interleave(lists), sources };
}

/* ---------- lookup satu lagu ---------- */
async function lookup(p) {
  if (p.src === 'au') { const t = await au('/tracks/' + p.id); return t ? { raw: t, track: auTrack(t) } : null; }
  const l = await ja('/tracks', { id: p.id, audioformat: 'mp32', audiodlformat: 'mp32', include: 'musicinfo' }); return l[0] ? { raw: l[0], track: jaTrack(l[0]) } : null;
}

export default async req => {
  const u = new URL(req.url), P = u.searchParams;
  try {
    if (P.has('health')) return json({ ok: true, audius: true, jamendo: !!JKEY }, 200, { 'Cache-Control': 'no-store' });

    /* --- stream: selalu ambil URL audio segar, lalu redirect --- */
    if (P.has('stream')) {
      const p = parseId(P.get('stream')); if (!p) return fail(400, 'bad_id', 'ID lagu tidak valid.');
      if (p.src === 'au') return new Response(null, { status: 302, headers: { Location: AU_BASE + '/v1/tracks/' + p.id + '/stream?app_name=' + encodeURIComponent(APP), 'Cache-Control': 'no-store' } });
      const l = await ja('/tracks', { id: p.id, audioformat: 'mp32' }); const a = l[0] && l[0].audio;
      if (!a) return fail(404, 'not_found', 'Sumber audio tidak ditemukan.');
      return new Response(null, { status: 302, headers: { Location: a, 'Cache-Control': 'no-store' } });
    }

    /* --- download: hanya jika diizinkan pemilik hak --- */
    if (P.has('download')) {
      const p = parseId(P.get('download')); if (!p) return fail(400, 'bad_id', 'ID lagu tidak valid.');
      const L = await lookup(p); if (!L || !L.track) return fail(404, 'not_found', 'Lagu tidak ditemukan.');
      const t = L.track; if (!t.dl) return json({ allowed: false, message: 'Pemilik hak tidak mengizinkan download untuk lagu ini.' }, 200, { 'Cache-Control': 'no-store' });
      const url = p.src === 'au' ? AU_BASE + '/v1/tracks/' + p.id + '/download?app_name=' + encodeURIComponent(APP) : L.raw.audiodownload;
      const base = cleanName(t.title + ' - ' + t.artist);
      if (!P.has('proxy')) return json({ allowed: true, url, filename: base }, 200, { 'Cache-Control': 'no-store' });
      const up = await tfetch(url, { redirect: 'follow' }, 9000);
      if (!up.ok || !up.body) return fail(502, 'upstream', 'Server sumber menolak permintaan download (' + up.status + ').');
      const len = +up.headers.get('content-length') || 0; if (len > MAX_PROXY) { try { up.body.cancel(); } catch (e) { /* abaikan */ } return json({ error: 'too_large', url, filename: base }, 413); }
      const type = up.headers.get('content-type') || 'application/octet-stream', ext = extOf(type, up.url);
      const fname = base + (ext ? '.' + ext : '');
      const h = { 'Content-Type': type, 'Content-Disposition': "attachment; filename=\"" + fname.replace(/[^\x20-\x7e]/g, '_') + "\"; filename*=UTF-8''" + encodeURIComponent(fname), 'Cache-Control': 'no-store', 'X-Filename': encodeURIComponent(fname) };
      if (len) h['Content-Length'] = String(len);
      return new Response(up.body, { status: 200, headers: h });
    }

    /* --- rekomendasi / trending --- */
    if (P.has('trending')) {
      const g = genreOf(P.get('genre'));
      const out = await gather({
        audius: async () => auList(await au('/tracks/trending', g ? { genre: g.au, time: 'week' } : { time: 'week' })).slice(0, 24),
        jamendo: async () => jaList(await ja('/tracks', { ...JA_BASE, limit: 24, order: 'popularity_week', ...(g ? { fuzzytags: g.ja } : {}) }))
      });
      return json(out, 200, { 'Cache-Control': 'public, max-age=600' });
    }

    /* --- pencarian --- */
    const q = (P.get('q') || '').trim().slice(0, 120);
    if (!q) return fail(400, 'empty', 'Masukkan kata kunci.');
    const type = ['track', 'artist', 'album', 'genre'].includes(P.get('type')) ? P.get('type') : 'all', src = P.get('src') || 'all';
    const jobs = {};
    if (src !== 'jamendo') jobs.audius = () => audiusSearch(q, type);
    if (src !== 'audius') jobs.jamendo = () => jamendoSearch(q, type);
    const out = await gather(jobs);
    return json(out, 200, { 'Cache-Control': 'public, max-age=300' });
  } catch (e) {
    return fail(e && e.code === 'nokey' ? 503 : 502, e && e.code === 'nokey' ? 'nokey' : 'upstream', e && e.code === 'nokey' ? 'JAMENDO_CLIENT_ID belum diatur di Netlify.' : 'Server musik sedang bermasalah. Coba lagi.');
  }
};
