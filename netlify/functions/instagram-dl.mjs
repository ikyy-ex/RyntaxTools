/* =====================================================================
   instagram-dl.mjs — Instagram Downloader (Reels / Video)
   Tool id: instagram-dl · kategori: Downloader
   Konfigurasi disalin verbatim dari index.html (baris serviceTool Instagram).
   ===================================================================== */
import { createServiceTool, urlRule } from './shared.mjs';

export const tool = createServiceTool({
  id: 'instagram-dl',
  key: 'instagram',
  name: 'Instagram (Reels / Video)',
  description: 'Unduh Reels atau video Instagram.',
  keywords: 'instagram reels video unduh download ig',
  icon: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>',
  action: 'Proses video',
  fields: [
    { id: 'url', label: 'URL Reels / video', ph: 'https://www.instagram.com/reel/...' }
  ],
  validate: urlRule(/instagram\.com/i, 'instagram.com'),
  label: v => v.url
});

export default tool;
