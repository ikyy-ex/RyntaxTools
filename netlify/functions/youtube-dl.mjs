/* =====================================================================
   youtube-dl.mjs — YouTube Downloader (Video & MP3)
   Tool id: youtube-dl · kategori: Downloader
   Konfigurasi disalin verbatim dari index.html (baris serviceTool YouTube).
   ===================================================================== */
import { createServiceTool, urlRule } from './shared.mjs';

export const tool = createServiceTool({
  id: 'youtube-dl',
  key: 'youtube',
  name: 'YouTube (Video & MP3)',
  description: 'Video MP4 atau audio MP3 dari YouTube.',
  keywords: 'youtube video mp3 mp4 audio unduh download yt',
  icon: '<rect x="2" y="5" width="20" height="14" rx="4"/><path d="m10 9 5 3-5 3z"/>',
  action: 'Proses',
  fields: [
    { id: 'url', label: 'URL YouTube', ph: 'https://youtu.be/...' },
    { id: 'format', label: 'Format', opts: [['mp4', 'Video MP4'], ['mp3', 'Audio MP3']] }
  ],
  validate: urlRule(/(youtube\.com|youtu\.be)/i, 'youtube.com / youtu.be'),
  label: v => v.format.toUpperCase() + ' · ' + v.url
});

export default tool;
