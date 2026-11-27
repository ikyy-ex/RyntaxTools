// Drama, Clips, Preset AM, Bilibili, Manga, NPSN. Sumber: file JSON milik Anda.
//   GET /api/katalog/{jenis}
import { json, guard } from '../lib/util.mjs';
import { DATA, cocok } from '../lib/katalog.mjs';

export function jawab(jenis, p, data = DATA) {
  if (!Object.hasOwn(data, jenis)) return json({ error: 'Katalog tidak dikenal.' }, 404);
  const list = data[jenis];
  if (jenis === 'drama' || jenis === 'clips') return json(list);
  if (jenis === 'preset' || jenis === 'bilibili') {
    const q = (p.get('q') || '').trim();
    return json(list.filter(i => i.url === q || cocok(q, i.title || '', i.desc || '', i.url || '')).slice(0, 60));
  }
  if (jenis === 'npsn') {
    const s = list.find(i => String(i.npsn) === p.get('npsn'));
    return s ? json(s) : json({ error: 'Data tidak ditemukan.' }, 404);
  }
  // manga: ?chapter=ID, ?id=ID, atau ?q=judul
  if (p.has('chapter')) {
    const c = list.flatMap(m => m.chapters || []).find(c => String(c.id) === p.get('chapter'));
    return c ? json({ pages: c.pages || [] }) : json({ error: 'Chapter tidak ditemukan.' }, 404);
  }
  if (p.has('id')) {
    const m = list.find(m => String(m.id) === p.get('id'));
    return m ? json({ chapters: (m.chapters || []).map(({ id, name }) => ({ id, name })) }) : json({ error: 'Judul tidak ditemukan.' }, 404);
  }
  const q = (p.get('q') || '').trim();
  return json(list.filter(m => cocok(q, m.title || '')).map(({ id, title, desc, thumb }) => ({ id, title, desc, thumb })));
}

export default async (req, context) => {
  const no = guard(req, context, 'katalog', 'GET', 120); if (no) return no;
  return jawab(context.params?.jenis || '', new URL(req.url).searchParams);
};

export const config = { path: '/api/katalog/:jenis' };
