import { json, isAdminAuthed } from "../lib/utils.js";

// Загрузка картинок из админки в ImgBB.
//
// Файл идёт через наш сервер, а не напрямую из браузера, по одной причине:
// ключ ImgBB нельзя показывать на странице — его вытащит любой из исходника
// и будет заливать что угодно от нашего имени.
//
//   POST { image: "<base64 без префикса data:>", name?: "имя" }
//   -> { ok:true, url }
//
// Требует IMGBB_API_KEY в переменных Vercel.

export const config = {
  api: { bodyParser: { sizeLimit: "12mb" } }
};

const MAX_BYTES = 8 * 1024 * 1024;   // 8 МБ: больше для меню не нужно

function safeBody(body) {
  if (!body) return {};
  if (typeof body === "object") return body;
  try { return JSON.parse(body); } catch { return {}; }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  if (!isAdminAuthed(req)) return json(res, 401, { error: "Unauthorized" });

  const key = process.env.IMGBB_API_KEY;
  if (!key) {
    return json(res, 500, {
      error: "NO_KEY",
      detail: "Не задан IMGBB_API_KEY в переменных Vercel"
    });
  }

  try {
    const b = safeBody(req.body);
    const base64 = String(b.image || "").replace(/^data:[^;]+;base64,/, "");
    if (!base64) return json(res, 400, { error: "Пустой файл" });

    // Длина base64 примерно на треть больше исходника
    const approxBytes = Math.floor(base64.length * 0.75);
    if (approxBytes > MAX_BYTES) {
      return json(res, 413, { error: "TOO_BIG", detail: "Файл больше 8 МБ" });
    }

    const form = new URLSearchParams();
    form.set("key", key);
    form.set("image", base64);
    if (b.name) form.set("name", String(b.name).slice(0, 100));

    const r = await fetch("https://api.imgbb.com/1/upload", { method: "POST", body: form });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d?.success) {
      return json(res, 502, { error: "UPLOAD_FAILED", detail: d?.error?.message || `HTTP ${r.status}` });
    }

    return json(res, 200, { ok: true, url: d.data.display_url || d.data.url });
  } catch (error) {
    console.error("admin-upload error", error);
    return json(res, 500, { error: "Failed", detail: String(error?.message || error) });
  }
}
