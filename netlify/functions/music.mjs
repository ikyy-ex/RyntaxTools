// Netlify Function: /.netlify/functions/music?q=kata  (arahkan /api/music ke sini lewat netlify.toml)
// Env: SOUNDCLOUD_CLIENT_ID, SOUNDCLOUD_CLIENT_SECRET
let tok = { v: '', exp: 0 };
async function token() {
  if (tok.v && Date.now() < tok.exp) return tok.v;
  const r = await fetch('https://secure.soundcloud.com/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.SOUNDCLOUD_CLIENT_ID, client_secret: process.env.SOUNDCLOUD_CLIENT_SECRET }) });
  if (!r.ok) throw new Error('token ' + r.status);
  const d = await r.json(); tok = { v: d.access_token, exp: Date.now() + Math.max(60, (d.expires_in || 3600) - 60) * 1000 };
  return tok.v;
}
exports.handler = async (event) => {
  const h = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60' };
  const q = ((event.queryStringParameters || {}).q || '').trim();
  if (!q) return { statusCode: 400, headers: h, body: JSON.stringify({ error: 'q wajib diisi' }) };
  if (!process.env.SOUNDCLOUD_CLIENT_ID || !process.env.SOUNDCLOUD_CLIENT_SECRET) return { statusCode: 503, headers: h, body: JSON.stringify({ error: 'Kredensial SoundCloud belum diatur di environment variables.' }) };
  try {
    const r = await fetch('https://api.soundcloud.com/tracks?limit=20&access=playable&q=' + encodeURIComponent(q), { headers: { Authorization: 'OAuth ' + await token(), Accept: 'application/json' } });
    if (!r.ok) return { statusCode: 502, headers: h, body: JSON.stringify({ error: 'SoundCloud membalas ' + r.status }) };
    const out = (await r.json()).filter(t => t && t.permalink_url && t.access === 'playable').map(t => ({
      title: t.title, artist: (t.user && t.user.username) || '', thumb: t.artwork_url ? t.artwork_url.replace('-large', '-t300x300') : '',
      url: t.permalink_url, duration: t.duration || 0, playable: true
    }));
    return { statusCode: 200, headers: h, body: JSON.stringify(out) };
  } catch (e) { return { statusCode: 502, headers: h, body: JSON.stringify({ error: 'Gagal menghubungi SoundCloud.' }) }; }
};
