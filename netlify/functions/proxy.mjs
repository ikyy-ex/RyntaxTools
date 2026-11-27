// Proxy untuk tool "Get Code HTML". GET ?url=https://... -> teks sumber halaman
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { json, guard } from '../lib/util.mjs';

// Alamat internal yang tidak boleh diakses (mencegah SSRF)
const blocked = new BlockList();
[['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 3]]
  .forEach(([a, p]) => blocked.addSubnet(a, p, 'ipv4'));
// IPv6: hanya alamat publik 2000::/3 yang diizinkan
const publicV6 = new BlockList(); publicV6.addSubnet('2000::', 3, 'ipv6');

export async function assertPublic(u) {
  if (!/^https?:$/.test(u.protocol) || u.username || u.password || (u.port && !['80', '443'].includes(u.port))) throw new Error('URL tidak diizinkan');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const addrs = isIP(host) ? [{ address: host, family: isIP(host) }] : await lookup(host, { all: true });
  if (!addrs.length || addrs.some(a => a.family === 4 ? blocked.check(a.address, 'ipv4') : !publicV6.check(a.address, 'ipv6') || a.address.startsWith('2002:'))) throw new Error('URL tidak diizinkan');
}

const MAX = 2 * 1024 * 1024;
export default async (req, context) => {
  const no = guard(req, context, 'proxy', 'GET', 20); if (no) return no;
  try {
    let u = new URL(new URL(req.url).searchParams.get('url') || ''), r;
    for (let i = 0; ; i++) {
      await assertPublic(u);
      r = await fetch(u, { redirect: 'manual', headers: { 'User-Agent': 'RyntaxTools/1.0', Accept: 'text/html,*/*' }, signal: AbortSignal.timeout(15000) });
      if (r.status < 300 || r.status > 399 || !r.headers.get('location')) break;
      if (i >= 4) return json({ error: 'Terlalu banyak pengalihan.' }, 502);
      u = new URL(r.headers.get('location'), u);
    }
    const chunks = []; let size = 0;
    if (r.body) for await (const c of r.body) { size += c.length; if (size > MAX) return json({ error: 'Halaman lebih dari 2 MB.' }, 413); chunks.push(c); }
    // Selalu dikirim sebagai teks agar skrip halaman lain tidak berjalan di domain Anda
    return new Response(Buffer.concat(chunks), { status: r.status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'", 'Cache-Control': 'no-store' } });
  } catch (e) { return json({ error: 'URL tidak valid, tidak diizinkan, atau gagal dihubungi.' }, 400); }
};
