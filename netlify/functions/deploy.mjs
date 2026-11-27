// Deploy Website: unggah ZIP menjadi situs Netlify baru. Khusus admin (wajib kata sandi).
// POST /api/deploy  multipart "file" + header X-Deploy-Password -> {url}
import { createHash, timingSafeEqual } from 'node:crypto';
import { env, json, guard } from '../lib/util.mjs';

const hash = s => createHash('sha256').update(s).digest();

export default async (req, context) => {
  const no = guard(req, context, 'deploy', 'POST', 5); if (no) return no;
  const token = env('DEPLOY_NETLIFY_TOKEN'), pass = env('DEPLOY_PASSWORD');
  if (!token || pass.length < 12) return json({ error: 'Isi DEPLOY_NETLIFY_TOKEN dan DEPLOY_PASSWORD (min. 12 karakter).' }, 503);
  let given = ''; try { given = decodeURIComponent(req.headers.get('x-deploy-password') || ''); } catch { /* tidak valid */ }
  if (!timingSafeEqual(hash(given), hash(pass))) return json({ error: 'Kata sandi salah.' }, 401);
  let file; try { file = (await req.formData()).get('file'); } catch { return json({ error: 'Format permintaan tidak valid.' }, 400); }
  if (!file || typeof file === 'string' || !/\.zip$/i.test(file.name)) return json({ error: 'Kirim file ZIP.' }, 400);
  if (file.size > 4 * 1024 * 1024) return json({ error: 'ZIP maksimal 4 MB.' }, 413);
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.subarray(0, 2).toString() !== 'PK') return json({ error: 'File bukan ZIP yang valid.' }, 400);
  try {
    const r = await fetch('https://api.netlify.com/api/v1/sites', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/zip' }, body: buf, signal: AbortSignal.timeout(28000) });
    const d = await r.json();
    const url = d.ssl_url || d.url;
    return r.ok && url ? json({ url: url.replace(/^http:/, 'https:') }) : json({ error: 'Netlify menolak deploy (' + r.status + ').' }, 502);
  } catch { return json({ error: 'Netlify tidak merespons.' }, 504); }
};

export const config = { path: '/api/deploy' };
