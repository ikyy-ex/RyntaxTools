// Ryntax AI dan tool tulis-otomatis. POST {messages:[{role,content}]} -> {reply}
import { env, json, guard } from '../lib/util.mjs';

export default async (req, context) => {
  const no = guard(req, context, 'gemini', 'POST', 15); if (no) return no;
  const key = env('GEMINI_API_KEY'); if (!key) return json({ error: 'GEMINI_API_KEY belum diisi di Netlify.' }, 503);
  let body; try { body = await req.json(); } catch { return json({ error: 'Format permintaan tidak valid.' }, 400); }
  const list = Array.isArray(body?.messages) ? body.messages.slice(-20) : [];
  const contents = list.filter(m => m && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  while (contents.length && contents[0].role !== 'user') contents.shift();
  if (!contents.length) return json({ error: 'Pesan kosong.' }, 400);
  if (JSON.stringify(contents).length > 30000) return json({ error: 'Pesan terlalu panjang. Hapus chat lalu coba lagi.' }, 413);
  const model = env('GEMINI_MODEL') || 'gemini-3.8-flash';
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents }), signal: AbortSignal.timeout(28000)
    });
    const d = await r.json();
    if (!r.ok) return json({ error: r.status === 429 ? 'Kuota Gemini habis. Coba lagi nanti.' : 'Gemini menolak permintaan (' + r.status + '). Periksa API key dan nama model.' }, 502);
    const reply = (d.candidates?.[0]?.content?.parts || []).filter(p => !p.thought).map(p => p.text || '').join('').trim();
    return reply ? json({ reply }) : json({ error: 'Gemini tidak memberi jawaban.' }, 502);
  } catch { return json({ error: 'Gemini tidak merespons. Coba lagi.' }, 504); }
};
