/* ============================================================================
   RYNTAX MUSIC — Netlify Function
   Letakkan di:  netlify/functions/ryntax-music.mjs
   Endpoint:     /.netlify/functions/ryntax-music

   Environment variable (Netlify → Site configuration → Environment variables):
     JAMENDO_CLIENT_ID = <client id dari https://devportal.jamendo.com>

   Client ID hanya dibaca di server, tidak pernah dikirim ke browser.
   Tanpa JAMENDO_CLIENT_ID, katalog Jamendo dilewati (sources.jamendo = 'nokey')
   dan hanya Audius yang dipakai.

   Parameter yang dipakai index.html:
     ?q=...&type=track|artist|album|genre   → pencarian
     ?trending=1[&genre=pop]                → trending
     ?stream=au:ID | ja:ID                  → redirect ke audio
     ?download=au:ID | ja:ID [&proxy=1]     → info/berkas unduhan (jika diizinkan)
     ?ping=1                                → cek status konfigurasi
   ============================================================================ */

const AUDIUS_ROOT = 'https://api.audius.co';
const JAMENDO_API = 'https://api.jamendo.com/v3.0';
const APP = 'RyntaxMusic';

const AU_GEN = { pop: 'Pop', rock: 'Rock', 'hip-hop': 'Hip-Hop/Rap', electronic: 'Electronic', 'lo-fi': 'Lo-Fi', jazz: 'Jazz', acoustic: 'Acoustic', 'r&b': 'R&B/Soul', classical: 'Classical', ambient: 'Ambient', metal: 'Metal', folk: 'Folk', reggae: 'Reggae', house: 'House', soundtrack: 'Soundtrack', latin: 'Latin' };
const JA_TAG = { pop: 'pop', rock: 'rock', 'hip-hop': 'hiphop', electronic: 'electronic', 'lo-fi': 'lofi', jazz: 'jazz', acoustic: 'acoustic', 'r&b': 'rnb', classical: 'classical', ambient: 'ambient', metal: 'metal', folk: 'folk', reggae: 'reggae', house: 'house', soundtrack: 'soundtrack', latin: 'latin' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/* ---------------------------------------------------------------- util ---- */
const env = k => {
  try { if (typeof Netlify !== 'undefined' && Netlify.env) return Netlify.env.get(k) || ''; } catch { /* abaikan */ }
  return (typeof process !== 'undefined' && process.env && process.env[k]) || '';
};
const jamendoId = () => String(env('JAMENDO_CLIENT_ID')).trim();

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS, ...extra } });

async function getJson(url, ms = 9000) {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const https = u => (typeof u === 'string' && u ? u.replace(/^http:\/\//i, 'https://') : '');
const okId = id => /^(au|ja):[A-Za-z0-9]+$/.test(id || '');
const safeName = s => String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'lagu';

function gkey(s) {
  s = String(s || '').toLowerCase().trim();
  if (!s) return '';
  if (/hip|rap/.test(s)) return 'hip-hop';
  if (/lo-?fi/.test(s)) return 'lo-fi';
  if (/r&b|rnb|soul/.test(s)) return 'r&b';
  if (/electro|edm|techno|dubstep|trance/.test(s)) return 'electronic';
  if (/klasik|classic/.test(s)) return 'classical';
  if (/akustik|acoustic/.test(s)) return 'acoustic';
  return AU_GEN[s] ? s : '';
}

/* -------------------------------------------------------------- Audius ---- */
let hostCache = { list: [], at: 0 };
async function auHosts(force = false) {
  if (!force && hostCache.list.length && Date.now() - hostCache.at < 10 * 60 * 1000) return hostCache.list;
  try {
    const d = await getJson(AUDIUS_ROOT, 5000);
    const list = (d.data || []).filter(h => /^https:\/\//.test(h));
    if (list.length) hostCache = { list, at: Date.now() };
  } catch { /* pakai cache / root */ }
  return hostCache.list.length ? hostCache.list : [AUDIUS_ROOT];
}

async function au(path, params = {}) {
  const qs = new URLSearchParams({ ...params, app_name: APP }).toString();
  let lastErr = new Error('Audius tidak merespons');
  for (const force of [false, true]) {
    const hosts = shuffle([...(await auHosts(force))]).slice(0, 3);
    for (const h of hosts) {
      try { const d = await getJson(`${h}/v1${path}?${qs}`, 9000); return d.data; }
      catch (e) { lastErr = e; }
    }
  }
  throw lastErr;
}

function auTrack(t, album) {
  if (!t || !t.id || !t.title || t.is_streamable === false || t.is_stream_gated || t.is_delete || t.is_unlisted) return null;
  const a = t.artwork || {};
  return {
    id: 'au:' + t.id, src: 'audius', title: t.title,
    artist: (t.user && (t.user.name || t.user.handle)) || '', album: album || '', genre: t.genre || '',
    duration: Math.round(t.duration || 0),
    cover: a['480x480'] || a['150x150'] || '', coverLg: a['1000x1000'] || a['480x480'] || '',
    dl: !!(t.is_downloadable && !t.is_download_gated),
    link: t.permalink ? 'https://audius.co' + t.permalink : '', license: '',
  };
}
const auList = (arr, album) => (Array.isArray(arr) ? arr : []).map(t => auTrack(t, album)).filter(Boolean);

async function searchAudius(p) {
  let items;
  if (p.trending) {
    items = auList(await au('/tracks/trending', AU_GEN[p.genre] ? { genre: AU_GEN[p.genre], time: 'week' } : { time: 'week' })).slice(0, 24);
  } else if (p.type === 'artist') {
    const us = ((await au('/users/search', { query: p.q, limit: 5 })) || []).filter(u => u.track_count > 0).slice(0, 2);
    items = (await Promise.all(us.map(u => au('/users/' + encodeURIComponent(u.id) + '/tracks', { limit: 25, sort: 'plays' }).then(l => auList(l)).catch(() => [])))).flat();
  } else if (p.type === 'album') {
    const ps = (await au('/playlists/search', { query: p.q, limit: 8 })) || [];
    const albums = (ps.some(x => x.is_album) ? ps.filter(x => x.is_album) : ps).slice(0, 2);
    items = (await Promise.all(albums.map(x => au('/playlists/' + encodeURIComponent(x.id) + '/tracks').then(l => auList(l, x.playlist_name)).catch(() => [])))).flat();
  } else if (p.type === 'genre' && AU_GEN[gkey(p.q)]) {
    items = auList(await au('/tracks/trending', { genre: AU_GEN[gkey(p.q)], time: 'month' }));
  }
  if (!items || (!items.length && !p.trending)) items = auList(await au('/tracks/search', { query: p.q, limit: 30 }));
  return items;
}

/* ------------------------------------------------------------- Jamendo ---- */
async function jam(path, params = {}) {
  const cid = jamendoId();
  if (!cid) throw Object.assign(new Error('JAMENDO_CLIENT_ID belum diatur'), { nokey: true });
  const qs = new URLSearchParams({ client_id: cid, format: 'json', ...params }).toString();
  const d = await getJson(`${JAMENDO_API}${path}?${qs}`, 9000);
  if (d && d.headers && d.headers.status && d.headers.status !== 'success') throw new Error(d.headers.error_message || 'Jamendo error');
  return (d && d.results) || [];
}

function licenseLabel(url) {
  const m = /licenses\/([a-z-]+)\/([\d.]+)/i.exec(url || '');
  return m ? ('CC ' + m[1].toUpperCase() + ' ' + m[2]) : (url ? 'Creative Commons' : '');
}

function jaTrack(t, parent) {
  if (!t || !t.id || !t.name || !t.audio) return null;
  parent = parent || {};
  const cover = https(t.image || t.album_image || parent.image || '');
  const tags = t.musicinfo && t.musicinfo.tags && t.musicinfo.tags.genres;
  const genre = Array.isArray(tags) && tags[0] ? String(tags[0]).replace(/^./, c => c.toUpperCase()) : '';
  return {
    id: 'ja:' + t.id, src: 'jamendo', title: t.name,
    artist: t.artist_name || parent.artist_name || parent.name || '',
    album: t.album_name || (parent.album_name) || '',
    genre, duration: Math.round(+t.duration || 0),
    cover, coverLg: cover.replace(/([?&])width=\d+/, '$1width=600'),
    dl: !!t.audiodownload_allowed,
    link: https(t.shareurl || ''), license: licenseLabel(t.license_ccurl),
  };
}

const JA_BASE = { include: 'musicinfo', audioformat: 'mp32', imagesize: 300 };

async function searchJamendo(p) {
  const tag = JA_TAG[gkey(p.genre || (p.type === 'genre' ? p.q : ''))];
  let items = [];
  if (p.trending) {
    items = (await jam('/tracks/', { ...JA_BASE, limit: 24, order: 'popularity_week', ...(tag ? { tags: tag } : {}) })).map(t => jaTrack(t));
  } else if (p.type === 'artist') {
    const arts = await jam('/artists/tracks/', { namesearch: p.q, limit: 2, imagesize: 300 });
    items = arts.flatMap(a => (a.tracks || []).slice(0, 25).map(t => jaTrack({ ...t, artist_name: a.name }, a)));
  } else if (p.type === 'album') {
    const albs = await jam('/albums/tracks/', { namesearch: p.q, limit: 2, imagesize: 300 });
    items = albs.flatMap(al => (al.tracks || []).map(t => jaTrack({ ...t, album_name: al.name, artist_name: al.artist_name, image: t.image || al.image }, al)));
  } else if (p.type === 'genre' && tag) {
    items = (await jam('/tracks/', { ...JA_BASE, limit: 30, order: 'popularity_month', tags: tag })).map(t => jaTrack(t));
  }
  items = items.filter(Boolean);
  if (!items.length && !p.trending) items = (await jam('/tracks/', { ...JA_BASE, limit: 30, search: p.q, order: 'relevance' })).map(t => jaTrack(t)).filter(Boolean);
  return items;
}

async function jamendoTrack(id) {
  const r = await jam('/tracks/', { id, include: 'musicinfo', audioformat: 'mp32', audiodlformat: 'mp32' });
  return r[0] || null;
}

/* ------------------------------------------------------------- handler ---- */
const interleave = (a, b) => {
  const out = [], seen = new Set(), n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) for (const t of [a[i], b[i]]) if (t && !seen.has(t.id)) { seen.add(t.id); out.push(t); }
  return out;
};

async function search(p) {
  const q = String(p.q || '').trim().slice(0, 100);
  const type = ['track', 'artist', 'album', 'genre'].includes(p.type) ? p.type : 'track';
  const genre = AU_GEN[p.genre] ? p.genre : '';
  const params = { q, type, genre, trending: p.trending ? 1 : 0 };
  if (!params.trending && !q) return json({ results: [], sources: {}, via: 'function' });

  const [au_, ja_] = await Promise.allSettled([searchAudius(params), searchJamendo(params)]);
  const sources = {
    audius: au_.status === 'fulfilled' ? 'ok' : 'error',
    jamendo: ja_.status === 'fulfilled' ? 'ok' : (ja_.reason && ja_.reason.nokey ? 'nokey' : 'error'),
  };
  if (sources.audius === 'error' && sources.jamendo !== 'ok') return json({ message: 'Sumber musik tidak merespons. Coba lagi.', sources }, 502);

  const results = interleave(au_.status === 'fulfilled' ? au_.value : [], ja_.status === 'fulfilled' ? ja_.value : []).slice(0, params.trending ? 24 : 40);
  return json({ results, sources, via: 'function' }, 200, { 'Cache-Control': 'public, max-age=120' });
}

async function stream(id) {
  if (!okId(id)) return json({ message: 'ID lagu tidak valid.' }, 400);
  const raw = id.slice(3);
  if (id.startsWith('au:')) {
    const host = (await auHosts())[0];
    return new Response(null, { status: 302, headers: { Location: `${host}/v1/tracks/${encodeURIComponent(raw)}/stream?app_name=${APP}`, 'Cache-Control': 'no-store', ...CORS } });
  }
  if (!jamendoId()) return json({ message: 'JAMENDO_CLIENT_ID belum diatur.' }, 503);
  const t = await jamendoTrack(raw);
  if (!t || !t.audio) return json({ message: 'Lagu tidak ditemukan.' }, 404);
  return new Response(null, { status: 302, headers: { Location: https(t.audio), 'Cache-Control': 'no-store', ...CORS } });
}

async function download(id, proxy) {
  if (!okId(id)) return json({ message: 'ID lagu tidak valid.' }, 400);
  const raw = id.slice(3);
  let info;
  if (id.startsWith('au:')) {
    const t = await au('/tracks/' + encodeURIComponent(raw));
    if (!t || !t.is_downloadable || t.is_download_gated) return json({ allowed: false, message: 'Pemilik hak tidak mengizinkan lagu ini diunduh.' });
    const host = (await auHosts())[0];
    info = { allowed: true, url: `${host}/v1/tracks/${encodeURIComponent(raw)}/download?app_name=${APP}`, filename: safeName(t.title + ' - ' + ((t.user && (t.user.name || t.user.handle)) || '')) };
  } else {
    if (!jamendoId()) return json({ message: 'JAMENDO_CLIENT_ID belum diatur.' }, 503);
    const t = await jamendoTrack(raw);
    if (!t) return json({ message: 'Lagu tidak ditemukan.' }, 404);
    if (!t.audiodownload_allowed || !t.audiodownload) return json({ allowed: false, message: 'Pemilik hak tidak mengizinkan lagu ini diunduh.' });
    info = { allowed: true, url: https(t.audiodownload), filename: safeName(t.name + ' - ' + (t.artist_name || '')) };
  }
  if (!proxy) return json(info, 200, { 'Cache-Control': 'no-store' });

  // Mode proxy: URL selalu dibentuk server dari ID (bukan dari input pengguna).
  const up = await fetch(info.url, { signal: AbortSignal.timeout(25000), redirect: 'follow' });
  const type = (up.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!up.ok || !up.body || !(/^audio\//.test(type) || type === 'application/octet-stream')) return json({ message: 'Sumber unduhan tidak merespons.' }, 502);
  const ext = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/flac': 'flac', 'audio/wav': 'wav', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/aac': 'aac' }[type] || 'mp3';
  const headers = { 'Content-Type': type, 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(info.filename + '.' + ext)}`, 'Cache-Control': 'no-store', ...CORS };
  const len = up.headers.get('content-length'); if (len) headers['Content-Length'] = len;
  return new Response(up.body, { status: 200, headers });
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'GET' && req.method !== 'HEAD') return json({ message: 'Metode tidak didukung.' }, 405);
  const p = Object.fromEntries(new URL(req.url).searchParams);
  try {
    if (p.ping) return json({ ok: true, jamendoKey: !!jamendoId() });
    if (p.stream) return await stream(String(p.stream));
    if (p.download) return await download(String(p.download), p.proxy === '1');
    return await search(p);
  } catch (e) {
    console.error('[ryntax-music]', e && e.message);
    return json({ message: 'Terjadi kesalahan pada server musik. Coba lagi.' }, 502);
  }
};
