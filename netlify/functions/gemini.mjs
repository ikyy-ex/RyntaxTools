const response = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  },
  body: JSON.stringify(body)
});

function normalizeModel(value) {
  return String(value || "")
    .trim()
    .replace(/^models\//i, "")
    .toLowerCase();
}

function toGeminiContents(messages) {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 40) {
    throw new Error("messages harus berupa array berisi 1–40 pesan.");
  }

  const contents = [];

  for (const item of messages) {
    if (!item || typeof item.content !== "string" || !item.content.trim()) {
      continue;
    }

    const role =
      item.role === "assistant" || item.role === "model"
        ? "model"
        : "user";

    const text = item.content.trim();
    const last = contents.at(-1);

    if (last && last.role === role) {
      last.parts[0].text += "\n" + text;
    } else {
      contents.push({
        role,
        parts: [{ text }]
      });
    }
  }

  while (contents.length && contents[0].role === "model") {
    contents.shift();
  }

  if (!contents.length) {
    throw new Error("Tidak ada pesan yang dapat diproses.");
  }

  return contents;
}

async function getAvailableModels(apiKey, signal) {
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000";

  const result = await fetch(url, {
    method: "GET",
    headers: {
      "x-goog-api-key": apiKey
    },
    signal
  });

  const data = await result.json().catch(() => ({}));

  if (!result.ok) {
    throw new Error(
      data?.error?.message ||
      `Gagal memeriksa model Gemini: HTTP ${result.status}`
    );
  }

  return Array.isArray(data.models) ? data.models : [];
}

function selectModel(models) {
  const available = models
    .filter(model =>
      Array.isArray(model.supportedGenerationMethods) &&
      model.supportedGenerationMethods.includes("generateContent")
    )
    .map(model => normalizeModel(model.name))
    .filter(Boolean);

  if (!available.length) {
    throw new Error(
      "Tidak ditemukan model Gemini yang mendukung generateContent untuk API Key ini."
    );
  }

  const configured = normalizeModel(process.env.GEMINI_MODEL);

  // Prioritaskan model yang diatur di Netlify.
  if (configured && available.includes(configured)) {
    return configured;
  }

  // Jika model konfigurasi tidak tersedia,
  // cari model Flash yang benar-benar tersedia.
  const flash = available.find(name =>
    /flash/i.test(name)
  );

  if (flash) {
    return flash;
  }

  // Pilihan terakhir: gunakan model pertama yang tersedia.
  return available[0];
}

export const handler = async (event) => {
  const headers = response(204, {}).headers;

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers,
      body: ""
    };
  }

  if (event.httpMethod !== "POST") {
    return response(405, {
      error: "Gunakan metode POST."
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return response(503, {
      error: "GEMINI_API_KEY belum diatur di Netlify."
    });
  }

  let payload;

  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return response(400, {
      error: "Body request harus berupa JSON yang valid."
    });
  }

  let contents;

  try {
    contents = toGeminiContents(payload.messages);
  } catch (error) {
    return response(400, {
      error: error.message
    });
  }

  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort();
  }, 25000);

  try {
    // Periksa model yang tersedia untuk API Key.
    const models = await getAvailableModels(
      apiKey,
      controller.signal
    );

    const model = selectModel(models);

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048
        }
      }),
      signal: controller.signal
    });

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      const detail =
        data?.error?.message ||
        `Gemini API HTTP ${upstream.status}`;

      if ([401, 403].includes(upstream.status)) {
        return response(upstream.status, {
          error: "API Key tidak valid, tidak memiliki izin, atau Gemini API belum diaktifkan."
        });
      }

      if (upstream.status === 429) {
        return response(429, {
          error: "Kuota Gemini tercapai. Coba lagi nanti."
        });
      }

      return response(
        upstream.status >= 500 ? 502 : upstream.status,
        {
          error: `Gemini menolak model ${model}: ${detail}`
        }
      );
    }

    const reply = (
      data?.candidates?.[0]?.content?.parts || []
    )
      .map(part => part.text || "")
      .join("")
      .trim();

    if (!reply) {
      return response(502, {
        error: "Gemini tidak mengembalikan teks jawaban."
      });
    }

    return response(200, {
      status: "ok",
      reply,
      model
    });

  } catch (error) {
    return response(502, {
      error:
        error?.name === "AbortError"
          ? "Permintaan Gemini timeout. Coba lagi."
          : error?.message ||
            "Backend tidak dapat menghubungi Gemini."
    });

  } finally {
    clearTimeout(timer);
  }
};
