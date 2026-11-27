// Foto ke Link, File ke Link, dan upload video. POST multipart field "file" -> {url}
import { randomUUID } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { json, guard } from '../lib/util.mjs';

export default async (req, context) => {
  const no = guard(req, context, 'upload', 'POST', 6); if (no) return no;
  let file; try { file = (await req.formData()).get('file'); } catch { return json({ error: 'Format permintaan tidak valid.' }, 400); }
  if (!file || typeof file === 'string' || !file.size) return json({ error: 'File kosong.' }, 400);
  if (file.size > 4 * 1024 * 1024) return json({ error: 'File maksimal 4 MB.' }, 413);
  const id = randomUUID().replace(/-/g, '');
  const name = (file.name || 'file').replace(/[^\w.\- ]+/g, '_').slice(-80);
  await getStore('uploads').set(id, await file.arrayBuffer(), { metadata: { name, type: file.type || 'application/octet-stream' } });
  return json({ url: new URL('/f/' + id, req.url).href });
};
