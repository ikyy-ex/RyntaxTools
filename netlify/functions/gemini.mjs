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

function getModelName() {
  // Accept either "gemini-2.5-flash" or "models/gemini-2.5-flash".
  // The REST URL below adds the "models/" path segment itself.
  const raw = (process.env.GEMINI_MODEL || "gemini-2.5-flash").trim();
  const model = raw.replace(/^models\//i, "");
  if (!/^[a-zA-Z0-9._-]+$/.test(model)) {
    throw new Error("GEMINI_MODEL tidak valid. Isi dengan nama model saja, contoh: gemini-2.5-flash (tanpa URL atau path models/).");
  }
  return model;
}

function toGeminiContents(messages) {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 40) {
    throw new Error("messages harus berupa array berisi 1–40 pesan.");
  }

  const contents = [];
  for (const item of messages) {
    if (!item || typeof item.content !== "string" || !item.content.trim()) continue;
    const role = item.role === "assistant" || item.role === "model" ? "model" : "user";
    const text = item.content.trim();
    const last = contents.at(-1);
    if (last && last.role === role) last.parts[0].text += "\n" + text;
    else contents.push({ role, parts: [{ text }] });
  }

  while (contents.length && contents[0].role === "model") contents.shift();
  if (!contents.length) throw new Error("Tidak ada pesan yang dapat diproses.");
  return contents;
}

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: response(204, {}).headers, body: "" };
  if (event.httpMethod !== "POST") return response(405, { error: "Gunakan metode POST." });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return response(503, { error: "GEMINI_API_KEY belum diatur pada Environment Variables Netlify." });

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return response(400, { error: "Body request harus berupa JSON yang valid." });
  }

  let contents, model;
  try {
    contents = toGeminiContents(payload.messages);
    model = getModelName();
  } catch (error) {
    return response(400, { error: error.message });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);

  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
      }),
      signal: controller.signal
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const detail = data?.error?.message || `Gemini API HTTP ${upstream.status}`;
      let error = detail;
      if (upstream.status === 400 && /model|format/i.test(detail)) {
        error = `Nama model "${model}" ditolak Gemini. Isi GEMINI_MODEL dengan nama model yang valid, misalnya gemini-2.5-flash, tanpa awalan "models/" atau URL.`;
      } else if ([401, 403].includes(upstream.status)) {
        error = "API key tidak valid, tidak memiliki izin, atau Gemini API belum diaktifkan.";
      } else if (upstream.status === 404) {
        error = `Model "${model}" tidak ditemukan atau tidak tersedia untuk API key ini. Periksa nama model di Google AI Studio.`;
      } else if (upstream.status === 429) {
        error = "Kuota atau batas penggunaan Gemini tercapai. Coba lagi nanti.";
      }
      return response(upstream.status >= 500 ? 502 : upstream.status, { error });
    }

    const reply = (data?.candidates?.[0]?.content?.parts || [])
      .map(part => part.text || "")
      .join("")
      .trim();

    if (!reply) return response(502, { error: "Gemini tidak mengembalikan teks jawaban." });
    return response(200, { status: "ok", reply });
  } catch (error) {
    return response(502, {
      error: error?.name === "AbortError"
        ? "Permintaan ke Gemini timeout. Coba lagi."
        : "Backend tidak dapat menghubungi layanan Gemini."
    });
  } finally {
    clearTimeout(timer);
  }
};
