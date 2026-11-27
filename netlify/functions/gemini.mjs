const json = (statusCode, body, headers = {}) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...corsHeaders(),
    ...headers
  },
  body: JSON.stringify(body)
});

function corsHeaders() {
  const origin = process.env.ALLOWED_ORIGIN || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };
}

function cleanMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 40) {
    throw new Error("messages harus berupa array berisi 1–40 pesan.");
  }

  const contents = [];
  for (const item of messages) {
    if (!item || typeof item.content !== "string") continue;
    const text = item.content.trim();
    if (!text) continue;
    const role = item.role === "assistant" || item.role === "model" ? "model" : "user";
    // Gemini expects alternating user/model turns. Merge consecutive turns with same role.
    const last = contents[contents.length - 1];
    if (last && last.role === role) last.parts[0].text += "\n" + text;
    else contents.push({ role, parts: [{ text }] });
  }

  while (contents.length && contents[0].role === "model") contents.shift();
  if (!contents.length) throw new Error("Tidak ada pesan yang dapat diproses.");
  return contents;
}

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(), body: "" };
  }
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Metode tidak diizinkan. Gunakan POST." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return json(503, { error: "GEMINI_API_KEY belum diatur pada Environment Variables Netlify." });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Body harus berupa JSON yang valid." });
  }

  let contents;
  try {
    contents = cleanMessages(payload.messages);
  } catch (error) {
    return json(400, { error: error.message });
  }

  const model = (process.env.GEMINI_MODEL || "gemini-2.5-flash").trim();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    let upstream;
    try {
      upstream = await fetch(endpoint, {
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
    } finally {
      clearTimeout(timeout);
    }

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const providerMessage = data?.error?.message || `Gemini API mengembalikan HTTP ${upstream.status}.`;
      const safeMessage = upstream.status === 400
        ? `Permintaan ditolak Gemini: ${providerMessage}`
        : upstream.status === 401 || upstream.status === 403
          ? "API key Gemini tidak valid, tidak memiliki izin, atau API belum diaktifkan."
          : upstream.status === 404
            ? `Model "${model}" tidak ditemukan atau tidak tersedia untuk API key ini. Periksa GEMINI_MODEL.`
            : upstream.status === 429
              ? "Batas penggunaan Gemini tercapai. Coba lagi nanti atau periksa kuota."
              : providerMessage;
      return json(upstream.status >= 500 ? 502 : upstream.status, { error: safeMessage });
    }

    const reply = (data?.candidates?.[0]?.content?.parts || [])
      .map(part => part.text || "")
      .join("")
      .trim();

    if (!reply) {
      return json(502, { error: "Gemini tidak mengembalikan teks. Coba kirim pesan lain." });
    }

    return json(200, { status: "ok", reply });
  } catch (error) {
    const message = error?.name === "AbortError"
      ? "Permintaan ke Gemini melewati batas waktu. Coba lagi."
      : "Tidak dapat menghubungi layanan Gemini dari backend.";
    return json(502, { error: message });
  }
};
