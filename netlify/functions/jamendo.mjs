/**
 * Jamendo API v3.0 Client & Serverless Handler (ES Module)
 * Kompatibel dengan Node.js 18+, Netlify Functions, dan Cloudflare Workers.
 *
 * Pastikan environment variable JAMENDO_CLIENT_ID sudah diatur di .env atau dashboard hosting.
 */

const JAMENDO_BASE_URL = 'https://api.jamendo.com/v3.0';

/**
 * Mengambil Client ID dari environment variable atau parameter opsional.
 */
function resolveClientId(customClientId) {
  const envClientId =
    typeof process !== 'undefined' && process.env
      ? process.env.JAMENDO_CLIENT_ID
      : undefined;

  const clientId = customClientId || envClientId;
  if (!clientId) {
    throw new Error(
      'JAMENDO_CLIENT_ID tidak ditemukan. Set environment variable JAMENDO_CLIENT_ID terlebih dahulu.'
    );
  }
  return clientId;
}

/**
 * Helper utama untuk melakukan request ke Jamendo API v3.0.
 *
 * @param {string} endpoint - Endpoint Jamendo (misal: 'tracks', 'albums', 'artists', 'playlists')
 * @param {Record<string, string|number|boolean>} params - Parameter query tambahan
 * @param {string} [customClientId] - Opsional Client ID manual (berguna untuk Cloudflare Workers env)
 * @returns {Promise<{headers: object, results: Array<object>}>}
 */
export async function fetchJamendo(endpoint, params = {}, customClientId) {
  const clientId = resolveClientId(customClientId);
  const cleanEndpoint = endpoint.replace(/^\/+|\/+$/g, '');
  const url = new URL(`${JAMENDO_BASE_URL}/${cleanEndpoint}/`);

  url.searchParams.set('client_id', clientId);
  url.searchParams.set('format', 'json');

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Jamendo API HTTP Error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (data.headers && data.headers.status !== 'success') {
    throw new Error(
      `Jamendo API Error (${data.headers.code}): ${data.headers.error_message || 'Unknown error'}`
    );
  }

  return {
    headers: data.headers || {},
    results: data.results || [],
  };
}

/**
 * Memformat objek lagu mentah dari Jamendo agar lebih ringkas dan siap pakai di frontend.
 */
export function formatTrack(track) {
  return {
    id: track.id,
    title: track.name,
    artist: track.artist_name,
    artistId: track.artist_id,
    album: track.album_name,
    albumId: track.album_id,
    duration: Number(track.duration) || 0,
    releaseDate: track.releasedate || null,
    cover: track.image || track.album_image || '',
    audioUrl: track.audio || '',
    downloadUrl: track.audiodownload_allowed ? track.audiodownload : null,
    downloadAllowed: Boolean(track.audiodownload_allowed),
    licenseUrl: track.license_ccurl || '',
    shareUrl: track.shareurl || '',
    tags: track.musicinfo?.tags || {},
    vocalInstrumental: track.musicinfo?.vocalinstrumental || null,
  };
}

/**
 * Mencari lagu berdasarkan kata kunci judul/artis/album.
 */
export async function searchTracks(query, options = {}, customClientId) {
  const { limit = 20, offset = 0, order = 'relevance', tags = '' } = options;
  const { headers, results } = await fetchJamendo(
    'tracks',
    {
      search: query,
      fuzzytags: tags,
      limit,
      offset,
      order,
      include: 'musicinfo',
      audioformat: 'mp32',
    },
    customClientId
  );

  return {
    total: headers.results_fullcount ?? results.length,
    tracks: results.map(formatTrack),
  };
}

/**
 * Mengambil lagu berdasarkan genre atau tag suasana (misal: 'lofi', 'electronic', 'cinematic', 'chillout').
 */
export async function getTracksByTag(tag, options = {}, customClientId) {
  const { limit = 20, offset = 0, order = 'popularity_week' } = options;
  const { headers, results } = await fetchJamendo(
    'tracks',
    {
      fuzzytags: tag,
      limit,
      offset,
      order,
      include: 'musicinfo',
      audioformat: 'mp32',
    },
    customClientId
  );

  return {
    total: headers.results_fullcount ?? results.length,
    tracks: results.map(formatTrack),
  };
}

/**
 * Mengambil daftar lagu populer saat ini.
 */
export async function getPopularTracks(options = {}, customClientId) {
  const { limit = 20, offset = 0, period = 'popularity_week' } = options;
  const { headers, results } = await fetchJamendo(
    'tracks',
    {
      limit,
      offset,
      order: period,
      include: 'musicinfo',
      audioformat: 'mp32',
    },
    customClientId
  );

  return {
    total: headers.results_fullcount ?? results.length,
    tracks: results.map(formatTrack),
  };
}

/**
 * Mengambil detail satu lagu berdasarkan ID Jamendo.
 */
export async function getTrackById(trackId, customClientId) {
  const { results } = await fetchJamendo(
    'tracks',
    {
      id: trackId,
      include: 'musicinfo+stats',
      audioformat: 'mp32',
    },
    customClientId
  );

  return results.length > 0 ? formatTrack(results[0]) : null;
}

/**
 * Mencari album musik di Jamendo.
 */
export async function searchAlbums(query, options = {}, customClientId) {
  const { limit = 20, offset = 0, order = 'popularity_total' } = options;
  const { headers, results } = await fetchJamendo(
    'albums',
    {
      namesearch: query,
      limit,
      offset,
      order,
    },
    customClientId
  );

  return {
    total: headers.results_fullcount ?? results.length,
    albums: results,
  };
}

/**
 * Mencari artis/musisi di Jamendo.
 */
export async function searchArtists(query, options = {}, customClientId) {
  const { limit = 20, offset = 0, order = 'popularity_total' } = options;
  const { headers, results } = await fetchJamendo(
    'artists',
    {
      namesearch: query,
      limit,
      offset,
      order,
    },
    customClientId
  );

  return {
    total: headers.results_fullcount ?? results.length,
    artists: results,
  };
}

/**
 * Handler Serverless siap pakai (kompatibel dengan Netlify Functions).
 * Contoh endpoint:
 * - GET /.netlify/functions/jamendo?action=search&q=lofi&limit=10
 * - GET /.netlify/functions/jamendo?action=tag&tag=cinematic
 * - GET /.netlify/functions/jamendo?action=popular&limit=15
 * - GET /.netlify/functions/jamendo?action=track&id=123456
 */
export async function handler(event) {
  const corsHeaders = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  try {
    const qs = event.queryStringParameters || {};
    const action = (qs.action || 'search').toLowerCase();
    const limit = Math.min(Math.max(parseInt(qs.limit || '20', 10) || 20, 1), 100);
    const offset = Math.max(parseInt(qs.offset || '0', 10) || 0, 0);

    let payload;

    switch (action) {
      case 'popular':
        payload = await getPopularTracks({
          limit,
          offset,
          period: qs.period || 'popularity_week',
        });
        break;

      case 'tag':
      case 'genre':
        if (!qs.tag) {
          return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Parameter "tag" wajib diisi.' }),
          };
        }
        payload = await getTracksByTag(qs.tag, {
          limit,
          offset,
          order: qs.order || 'popularity_week',
        });
        break;

      case 'track':
        if (!qs.id) {
          return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Parameter "id" wajib diisi.' }),
          };
        }
        payload = await getTrackById(qs.id);
        break;

      case 'albums':
        payload = await searchAlbums(qs.q || '', { limit, offset });
        break;

      case 'artists':
        payload = await searchArtists(qs.q || '', { limit, offset });
        break;

      case 'search':
      default:
        payload = await searchTracks(qs.q || 'lofi', {
          limit,
          offset,
          tags: qs.tag || '',
          order: qs.order || 'relevance',
        });
        break;
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        action,
        data: payload,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: error.message || 'Terjadi kesalahan saat memanggil Jamendo API.',
      }),
    };
  }
}

export default {
  fetchJamendo,
  formatTrack,
  searchTracks,
  getTracksByTag,
  getPopularTracks,
  getTrackById,
  searchAlbums,
  searchArtists,
  handler,
};
