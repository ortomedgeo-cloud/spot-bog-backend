import { getEventTableOverrides, setEventTableOverrides } from "../lib/db.js";
import { json, isAdminAuthed } from "../lib/utils.js";

// Своя вместимость столов под конкретное событие (например, часть Movie
// Dinner рассаживает столы на 4 только по 2). Строки — только для тех
// столов, где вместимость отличается от плана зала по умолчанию.
//
//   GET  ?event_id=ev_x                          -> { overrides }
//   POST { event_id, overrides:[{table_label,capacity_min,capacity_max}] }
//        -> полная замена набора для события, вернёт актуальный список

function safeBody(body) {
  if (!body) return {};
  if (typeof body === "object") return body;
  try { return JSON.parse(body); } catch { return {}; }
}

export default async function handler(req, res) {
  if (!isAdminAuthed(req)) return json(res, 401, { error: "Unauthorized" });

  try {
    if (req.method === "GET") {
      const eventId = String(req.query?.event_id || "").trim();
      if (!eventId) return json(res, 400, { error: "Missing event_id" });
      return json(res, 200, { ok: true, overrides: await getEventTableOverrides(eventId) });
    }

    if (req.method === "POST") {
      const b = safeBody(req.body);
      const eventId = String(b.event_id || "").trim();
      if (!eventId) return json(res, 400, { error: "Missing event_id" });

      const overrides = (Array.isArray(b.overrides) ? b.overrides : [])
        .map((o) => ({
          table_label: String(o?.table_label || "").trim(),
          capacity_min: Number(o?.capacity_min),
          capacity_max: Number(o?.capacity_max)
        }))
        .filter((o) =>
          o.table_label &&
          Number.isFinite(o.capacity_min) && o.capacity_min > 0 &&
          Number.isFinite(o.capacity_max) && o.capacity_max >= o.capacity_min
        );

      const result = await setEventTableOverrides(eventId, overrides);
      return json(res, 200, { ok: true, overrides: result });
    }

    return json(res, 405, { error: "Method not allowed" });
  } catch (error) {
    console.error("admin-event-overrides error", error);
    return json(res, 500, { error: "Failed", detail: String(error?.message || error) });
  }
}
