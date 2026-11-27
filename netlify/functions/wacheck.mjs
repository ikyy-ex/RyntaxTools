// Cek Nomor: validasi nomor lewat Twilio Lookup. BUKAN pengecekan status WhatsApp/banned.
// POST /api/wacheck {number} -> {status}
import { env, json, guard } from '../lib/util.mjs';

export default async (req, context) => {
  const no = guard(req, context, 'wacheck', 'POST', 5); if (no) return no;
  const sid = env('TWILIO_ACCOUNT_SID'), token = env('TWILIO_AUTH_TOKEN');
  if (!sid || !token) return json({ status: 'Layanan cek nomor belum dikonfigurasi.' }, 503);
  const body = await req.json().catch(() => null), num = String(body?.number || '').replace(/\D/g, '');
  if (!/^[1-9]\d{7,14}$/.test(num)) return json({ status: 'Format nomor tidak valid.' }, 400);
  try {
    const r = await fetch('https://lookups.twilio.com/v2/PhoneNumbers/%2B' + num, { headers: { Authorization: 'Basic ' + Buffer.from(sid + ':' + token).toString('base64') }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return json({ status: 'Layanan cek nomor gagal (' + r.status + ').' }, 502);
    const d = await r.json();
    return json({ status: (d.valid ? 'Nomor valid (' + (d.country_code || '-') + ')' : 'Nomor tidak valid') + '. Status WhatsApp tidak diperiksa.' });
  } catch { return json({ status: 'Layanan cek nomor tidak merespons.' }, 504); }
};

export const config = { path: '/api/wacheck' };
