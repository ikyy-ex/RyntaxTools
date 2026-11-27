// Dipakai panel TEST API (buka situs dengan ?admin). Tidak pernah mengirim isi kunci.
import { env, json } from '../lib/util.mjs';

export default async () => json({
  services: {
    gemini: { configured: !!env('GEMINI_API_KEY') },
    rembg: { configured: !!env('REMOVEBG_API_KEY') },
    proxy: { configured: true }
  }
});
