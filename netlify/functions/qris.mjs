// QRIS Payment Generator (Midtrans Core API)
//   POST /api/qris/charge            buat QRIS dinamis
//   GET  /api/qris/transaction/{id}  cek status resmi
//   GET  /api/qris/static            payload QRIS statis milik merchant
import { randomUUID } from 'node:crypto';
import { env, json, guard } from '../lib/util.mjs';

const base = () => env('MIDTRANS_PRODUCTION') === 'true' ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com';
const call = (path, init = {}) => fetch(base() + path, { ...init, signal: AbortSignal.timeout(20000), headers: {
  Accept: 'application/json', 'Content-Type': 'application/json',
  Authorization: 'Basic ' + Buffer.from(env('MIDTRANS_SERVER_KEY') + ':').toString('base64')
} });
const ID = /^RYN-[a-f0-9]{32}$/;

export default async (req, context) => {
  const path = new URL(req.url).pathname.replace(/^\/api\/qris\/?/, '');
  const isCharge = path === 'charge';
  const no = guard(req, context, isCharge ? 'qris-charge' : 'qris', isCharge ? 'POST' : 'GET', isCharge ? 5 : 120); if (no) return no;

  if (path === 'static') return json({ payload: env('STATIC_QRIS_PAYLOAD') });
  if (!env('MIDTRANS_SERVER_KEY')) return json({ ok: false, error: 'PAYMENT_GATEWAY_NOT_CONFIGURED' }, 503);

  try {
    if (isCharge) {
      const b = await req.json().catch(() => null), amount = Number(b?.amount);
      if (!Number.isInteger(amount) || amount < 1000 || amount > 50000000) return json({ ok: false, message: 'Nominal harus Rp1.000 - Rp50.000.000.' }, 400);
      // ID acak dibuat di server agar status transaksi tidak bisa ditebak
      const orderId = 'RYN-' + randomUUID().replace(/-/g, '');
      const r = await call('/v2/charge', { method: 'POST', body: JSON.stringify({
        payment_type: 'qris',
        transaction_details: { order_id: orderId, gross_amount: amount },
        customer_details: { first_name: String(b.payerName || b.merchantName || 'Pelanggan').slice(0, 60), phone: String(b.phone || '').slice(0, 20) },
        qris: { acquirer: env('MIDTRANS_ACQUIRER') || 'gopay' },
        custom_expiry: { expiry_duration: 15, unit: 'minute' }
      }) });
      const d = await r.json();
      if (!r.ok || !['200', '201'].includes(String(d.status_code))) return json({ ok: false, message: 'Midtrans: ' + (d.status_message || 'transaksi ditolak') }, 502);
      const qr = (d.actions || []).find(a => /^generate-qr-code/.test(a.name));
      return json({ ok: true, provider: 'midtrans', transactionId: orderId, amount, qrisPayload: d.qr_string || '', qrImageUrl: qr?.url || '', expiresAt: Date.now() + 15 * 60 * 1000 });
    }
    const m = path.match(/^transaction\/([^/]+)$/);
    if (!m || !ID.test(m[1])) return json({ ok: false, message: 'Transaksi tidak ditemukan.' }, 404);
    const r = await call('/v2/' + m[1] + '/status'), d = await r.json();
    if (!r.ok || !d.transaction_status) return json({ ok: false, message: 'Status belum tersedia.' }, 404);
    const status = d.transaction_status === 'capture' && d.fraud_status !== 'accept' ? 'pending' : d.transaction_status;
    return json({ ok: true, status });
  } catch { return json({ ok: false, message: 'Midtrans tidak merespons.' }, 504); }
};

export const config = { path: '/api/qris/*' };
