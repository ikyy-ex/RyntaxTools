// Ryntax Resep Koki: resep Anda (netlify/data/resep.json) + TheMealDB. GET /api/resep?q=
import { env, json, guard } from '../lib/util.mjs';
import { cocok } from '../lib/katalog.mjs';
import lokal from '../data/resep.json' with { type: 'json' };

// TheMealDB berbahasa Inggris: terjemahkan kata kunci umum
const KAMUS = { ayam: 'chicken', sapi: 'beef', daging: 'beef', ikan: 'fish', udang: 'prawn', telur: 'egg', nasi: 'rice', mie: 'noodle', sayur: 'vegetable', kambing: 'lamb', sup: 'soup', sop: 'soup', tahu: 'tofu', kentang: 'potato' };

const ubah = m => ({
  title: m.strMeal, desc: [m.strCategory, m.strArea, 'TheMealDB'].filter(Boolean).join(' · '), thumb: m.strMealThumb || '', url: m.strSource || m.strYoutube || '',
  ing: Array.from({ length: 20 }, (_, i) => [m['strMeasure' + (i + 1)], m['strIngredient' + (i + 1)]]).filter(x => x[1]?.trim()).map(x => x.map(v => (v || '').trim()).filter(Boolean).join(' ')),
  steps: String(m.strInstructions || '').split(/\r?\n+/).map(t => t.trim()).filter(Boolean)
});

export default async (req, context) => {
  const no = guard(req, context, 'resep', 'GET', 30); if (no) return no;
  const q = (new URL(req.url).searchParams.get('q') || '').trim().slice(0, 60);
  const hasil = lokal.filter(r => cocok(q, r.title, r.desc || '', (r.ing || []).join(' ')));
  if (q) {
    try {
      const kata = q.toLowerCase().split(/\s+/).map(k => KAMUS[k] || k).join(' ');
      const r = await fetch('https://www.themealdb.com/api/json/v1/' + encodeURIComponent(env('MEALDB_API_KEY') || '1') + '/search.php?s=' + encodeURIComponent(kata), { signal: AbortSignal.timeout(8000) });
      if (r.ok) hasil.push(...((await r.json()).meals || []).slice(0, 12).map(ubah));
    } catch { /* sumber luar gagal: tetap kirim resep lokal */ }
  }
  return json(hasil);
};

export const config = { path: '/api/resep' };
