/* =====================================================================
   nokos.mjs — Ryntax Nokos (nomor virtual OTP)
   Tool id: ryntax-nokos · kategori: Downloader
   Konfigurasi disalin verbatim dari index.html (baris serviceTool Nokos).
   ===================================================================== */
import { createServiceTool } from './shared.mjs';

export const tool = createServiceTool({
  id: 'ryntax-nokos',
  key: 'nokos',
  name: 'Ryntax Nokos',
  badge: ['DISEMATKAN', 'TERPOPULER'],
  description: 'Pesan nomor virtual untuk verifikasi OTP.',
  keywords: 'nokos nomor kosong virtual otp whatsapp telegram verifikasi',
  icon: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  action: 'Pesan nomor',
  fields: [
    { id: 'app', label: 'Layanan', opts: ['WhatsApp', 'Telegram', 'Instagram', 'TikTok', 'Lainnya'] },
    { id: 'country', label: 'Negara', opts: ['Indonesia', 'Amerika Serikat', 'Inggris', 'Malaysia'] }
  ],
  validate: null,
  label: v => v.app + ' · ' + v.country
});

export default tool;
