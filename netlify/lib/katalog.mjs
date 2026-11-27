// Membaca isi netlify/data/*.json (diisi pemilik situs)
import drama from '../data/drama.json' with { type: 'json' };
import clips from '../data/clips.json' with { type: 'json' };
import preset from '../data/preset.json' with { type: 'json' };
import bilibili from '../data/bilibili.json' with { type: 'json' };
import manga from '../data/manga.json' with { type: 'json' };
import npsn from '../data/npsn.json' with { type: 'json' };

export const DATA = { drama, clips, preset, bilibili, manga, npsn };
export const cocok = (q, ...teks) => { const t = teks.join(' ').toLowerCase(); return q.toLowerCase().split(/\s+/).every(k => t.includes(k)); };
