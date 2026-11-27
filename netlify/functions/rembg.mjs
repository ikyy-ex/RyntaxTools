// Hapus Background via API (remove.bg). POST multipart field "image_file" -> PNG
import { env, json, guard } from '../lib/util.mjs';

export default async (req, context) => {
  const no = guard(req, context, 'rembg', 'POST', 5); if (no) return no;
  const key = env('REMOVEBG_API_KEY'); if (!key) return json({ error: 'REMOVEBG_API_KEY belum diisi.' }, 503);
  let file; try { file = (await req.formData()).get('image_file'); } catch { return json({ error: 'Format permintaan tidak valid.' }, 400); }
  if (!file || typeof file === 'string' || !file.type.startsWith('image/')) return json({ error: 'Kirim file gambar.' }, 400);
  if (file.size > 4 * 1024 * 1024) return json({ error: 'Gambar maksimal 4 MB.' }, 413);
  const fd = new FormData(); fd.append('image_file', file, file.name || 'gambar'); fd.append('size', 'auto');
  try {
    const r = await fetch('https://api.remove.bg/v1.0/removebg', { method: 'POST', headers: { 'X-Api-Key': key }, body: fd, signal: AbortSignal.timeout(28000) });
    if (!r.ok) return json({ error: 'remove.bg gagal (' + r.status + ').' }, 502);
    return new Response(await r.arrayBuffer(), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' } });
  } catch { return json({ error: 'remove.bg tidak merespons.' }, 504); }
};
