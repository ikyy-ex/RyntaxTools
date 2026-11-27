// Menyajikan file hasil upload di /f/{id}
import { getStore } from '@netlify/blobs';

// Hanya jenis aman yang tampil langsung; lainnya (HTML, SVG, dll.) dipaksa unduh
const INLINE = /^(image\/(png|jpeg|gif|webp|avif|bmp)|video\/(mp4|webm|ogg|quicktime)|audio\/(mpeg|mp4|ogg|wav|webm))$/;

export default async (req, context) => {
  const id = context.params?.id || '';
  if (!/^[a-f0-9]{32}$/.test(id)) return new Response('Tidak ditemukan', { status: 404 });
  const hit = await getStore('uploads').getWithMetadata(id, { type: 'arrayBuffer' });
  if (!hit) return new Response('Tidak ditemukan', { status: 404 });
  const { name = 'file', type = '' } = hit.metadata || {}, inline = INLINE.test(type);
  return new Response(hit.data, { headers: {
    'Content-Type': inline ? type : 'application/octet-stream',
    'Content-Disposition': (inline ? 'inline' : 'attachment') + '; filename="' + name.replace(/"/g, '') + '"',
    'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self'; media-src 'self'",
    'Cache-Control': 'public, max-age=3600'
  } });
};

export const config = { path: '/f/:id' };
