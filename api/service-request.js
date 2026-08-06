import {
  normalizeSeat,
  SERVICE_KINDS,
  recentServiceRequest,
  createServiceRequest
} from "../lib/db.js";
import { notify } from "../lib/notify.js";
import { escapeHtml } from "../lib/telegram.js";
import { json } from "../lib/utils.js";

// Быстрая просьба со стола: официант / счёт / плед / зарядка / пепельница.
// Публичный эндпоинт (гость не логинится), поэтому:
//   * метка стола сверяется со справочником — произвольный текст не пройдёт;
//   * тот же вид просьбы с того же стола не чаще раза в 20 секунд.

export const config = { api: { bodyParser: true } };

const LABEL = {
  waiter:  "Официант",
  bill:    "Счёт",
  blanket: "Плед",
  charger: "Зарядка",
  ashtray: "Пепельница"
};

function safeBody(body) {
  if (!body) return {};
  if (typeof body === "object") return body;
  try { return JSON.parse(body); } catch { return {}; }
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  try {
    const b = safeBody(req.body);
    const table = normalizeSeat(b.table);
    const kind = String(b.kind || "").trim();

    if (!table) {
      return json(res, 400, { error: "UNKNOWN_TABLE" });
    }
    if (!SERVICE_KINDS.includes(kind)) {
      return json(res, 400, { error: "UNKNOWN_KIND" });
    }

    const dup = await recentServiceRequest(table, kind, 20);
    if (dup) {
      return json(res, 429, { error: "TOO_SOON", detail: "Просьба уже отправлена" });
    }

    const comment = String(b.comment || "").slice(0, 300).trim();
    const lang = ["ru", "ka", "en"].includes(b.lang) ? b.lang : null;

    const sr = await createServiceRequest({ table_label: table, kind, comment, lang });

    try {
      await notify(
        `🔔 <b>${LABEL[kind]}</b> — ${escapeHtml(table)}${comment ? `\nКомментарий: ${escapeHtml(comment)}` : ""}`
      );
    } catch (e) {
      // Просьба уже в базе и видна в админке — уведомление не критично.
      console.error("service-request notify failed", e);
    }

    return json(res, 200, { ok: true, id: sr.id });
  } catch (error) {
    console.error("service-request error", error);
    return json(res, 500, { error: "Failed", detail: String(error?.message || error) });
  }
}
