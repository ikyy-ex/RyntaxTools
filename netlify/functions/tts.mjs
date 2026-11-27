// Unduh MP3 pada tool Teks ke Suara (Google Cloud Text-to-Speech)
import { env, json, guard } from '../lib/util.mjs';

const clamp = (v, a, b, d) => Number.isFinite(+v) ? Math.min(b, Math.max(a, +v)) : d;

export default async (req, context) => {
  const no = guard(req, context, 'tts', 'POST', 10); if (no) return no;
  const key = env('GOOGLE_TTS_API_KEY'); if (!key) return json({ error: 'GOOGLE_TTS_API_KEY belum diisi.' }, 503);
  let b; try { b = await req.json(); } catch { return json({ error: 'Format permintaan tidak valid.' }, 400); }
  const text = String(b?.text || '').trim();
  if (!text) return json({ error: 'Teks kosong.' }, 400);
  if (Buffer.byteLength(text) > 4800) return json({ error: 'Teks terlalu panjang.' }, 413);
  const lang = /^[a-z]{2,3}-[A-Z]{2}$/.test(String(b.lang || '').replace('_', '-')) ? b.lang.replace('_', '-') : 'id-ID';
  try {
    const r = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, signal: AbortSignal.timeout(20000),
      body: JSON.stringify({ input: { text }, voice: { languageCode: lang }, audioConfig: { audioEncoding: 'MP3', speakingRate: clamp(b.rate, 0.5, 2, 1), pitch: (clamp(b.pitch, 0, 2, 1) - 1) * 10 } })
    });
    const d = await r.json();
    if (!r.ok || !d.audioContent) return json({ error: 'Google TTS gagal (' + r.status + ').' }, 502);
    return new Response(Buffer.from(d.audioContent, 'base64'), { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' } });
  } catch { return json({ error: 'Google TTS tidak merespons.' }, 504); }
};
