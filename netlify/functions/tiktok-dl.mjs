/* =====================================================================
   tiktok-dl.mjs — TikTok Downloader (No Watermark)
   Tool id: tiktok-dl · kategori: Downloader
   Konfigurasi disalin verbatim dari index.html (baris serviceTool TikTok).
   ===================================================================== */
import { createServiceTool, urlRule } from './shared.mjs';

export const tool = createServiceTool({
  id: 'tiktok-dl',
  key: 'tiktok',
  name: 'TikTok (No Watermark)',
  badge: 'TERPOPULER',
  description: 'Video TikTok tanpa watermark.',
  keywords: 'tiktok video tanpa watermark unduh download',
  icon: '<path d="M12 3v12a4 4 0 1 1-4-4M12 3c0 3 2 5 5 5"/>',
  action: 'Proses video',
  fields: [
    { id: 'url', label: 'URL video TikTok', ph: 'https://vt.tiktok.com/...' }
  ],
  validate: urlRule(/tiktok\.com/i, 'tiktok.com'),
  label: v => v.url
});

export default tool;
