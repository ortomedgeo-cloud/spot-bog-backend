import {
  getCustomFloorPlan,
  saveCustomFloorPlan,
  clearCustomFloorPlan,
  floorLabelsInUse
} from "../lib/db.js";
import { json, isAdminAuthed } from "../lib/utils.js";

// Кастомная рассадка: свой план зала под конкретное событие (все его сеансы)
// или под один сеанс. Общий план зала (вкладка «Зал») при этом не меняется.
//
//   GET  ?event_id=ev_x    -> { custom, settings, tables, inUse }
//   GET  ?session_id=s_x   -> то же для одного сеанса
//        custom=false означает, что своего плана ещё нет и отдана копия
//        общего — редактору есть от чего оттолкнуться.
//
//   POST { event_id|session_id, settings, tables }  -> сохранить свой план
//   POST { event_id|session_id, action:'reset' }    -> вернуться к общему плану
//
// Метки столов остаются метками общего плана: метка связывает бронь с местом,
// и своя метка на своём плане означала бы, что архив перестанет понимать,
// где сидел гость.

function safeBody(body) {
  if (!body) return {};
  if (typeof body === "object") return body;
  try { return JSON.parse(body); } catch { return {}; }
}

function scopeOf(src) {
  const eventId = String(src?.event_id || "").trim();
  const sessionId = String(src?.session_id || "").trim();
  if (eventId && sessionId) return { error: "Укажи что-то одно: event_id или session_id" };
  if (!eventId && !sessionId) return { error: "Missing event_id or session_id" };
  return { eventId: eventId || undefined, sessionId: sessionId || undefined };
}

export default async function handler(req, res) {
  if (!isAdminAuthed(req)) return json(res, 401, { error: "Unauthorized" });

  try {
    if (req.method === "GET") {
      const s = scopeOf(req.query);
      if (s.error) return json(res, 400, { error: s.error });
      const plan = await getCustomFloorPlan(s);
      return json(res, 200, { ok: true, ...plan, inUse: await floorLabelsInUse() });
    }

    if (req.method === "POST") {
      const b = safeBody(req.body);
      const s = scopeOf(b);
      if (s.error) return json(res, 400, { error: s.error });

      if (b.action === "reset") {
        const cleared = await clearCustomFloorPlan(s);
        const plan = await getCustomFloorPlan(s);
        return json(res, 200, { ok: true, cleared, ...plan, inUse: await floorLabelsInUse() });
      }

      const tables = Array.isArray(b.tables) ? b.tables : [];
      if (!tables.length) {
        return json(res, 400, {
          error: "EMPTY_PLAN",
          detail: "В плане нет столов. Чтобы вернуться к общему плану, нажми «Сбросить»."
        });
      }

      // Метка обязательна и уникальна внутри плана — по ней бронь занимает место.
      const seen = new Set();
      for (const t of tables) {
        const label = String(t?.label || "").trim();
        if (!label) return json(res, 400, { error: "EMPTY_LABEL", detail: "У стола должна быть метка" });
        if (seen.has(label)) {
          return json(res, 400, { error: "DUPLICATE_LABEL", detail: `Метка «${label}» повторяется` });
        }
        seen.add(label);
      }

      const plan = await saveCustomFloorPlan({
        ...s,
        settings: b.settings || {},
        tables,
        note: b.note
      });
      return json(res, 200, { ok: true, ...plan, inUse: await floorLabelsInUse() });
    }

    return json(res, 405, { error: "Method not allowed" });
  } catch (error) {
    console.error("admin-custom-floor error", error);
    return json(res, 500, { error: "Failed", detail: String(error?.message || error) });
  }
}
