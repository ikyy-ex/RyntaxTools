// Pencarian Ryntax Tube (YouTube Data API v3). GET ?q=kata -> [{title,desc,thumb,url}]
import { env, json, guard } from '../lib/util.mjs';

const plain = s => String(s || '').replace(/&(amp|lt|gt|quot|#39);/g, (m, k) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[k]);

export default async (req, context) => {
  const no = guard(req, context, 'tube', 'GET', 10); if (no) return no;
  const key = env('YOUTUBE_API_KEY'); if (!key) return json({ error: 'YOUTUBE_API_KEY belum diisi.' }, 503);
  const q = (new URL(req.url).searchParams.get('q') || '').trim().slice(0, 100);
  if (!q) return json({ error: 'Kata kunci kosong.' }, 400);
  const p = new URLSearchParams({ part: 'snippet', type: 'video', maxResults: '18', safeSearch: 'moderate', regionCode: 'ID', videoEmbeddable: 'true', q });
  if (q.toLowerCase() === 'live') p.set('eventType', 'live');
  try {
    const r = await fetch('https://www.googleapis.com/youtube/v3/search?' + p, { headers: { 'x-goog-api-key': key }, signal: AbortSignal.timeout(10000) });
    const d = await r.json();
    if (!r.ok) return json({ error: 'YouTube API gagal (' + r.status + ').' }, 502);
    return json((d.items || []).filter(i => i.id?.videoId).map(i => ({
      title: plain(i.snippet.title), desc: plain(i.snippet.channelTitle),
      thumb: i.snippet.thumbnails?.medium?.url || '', url: 'https://www.youtube.com/watch?v=' + i.id.videoId
    })));
  } catch { return json({ error: 'YouTube API tidak merespons.' }, 504); }
};
