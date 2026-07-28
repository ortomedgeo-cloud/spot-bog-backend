import { listEvents, createEvent, updateEvent, deleteEventsByIds, bulkUpdateEvents } from "../lib/db.js";
import { json, isAdminAuthed } from "../lib/utils.js";

// GET  -> list all events
// POST -> create event { tmdb_id, title, poster_url, format, price, deposit_text }
// POST with body.id -> update that event

function safeBody(body) {
  if (!body) return {};
  if (typeof body === "object") return body;
  try { return JSON.parse(body); } catch { return {}; }
}

export default async function handler(req, res) {
  if (!isAdminAuthed(req)) return json(res, 401, { error: "Unauthorized" });

  try {
    if (req.method === "GET") {
      const events = await listEvents();
      return json(res, 200, { ok: true, events });
    }

    if (req.method === "POST") {
      const b = safeBody(req.body);

      // Batch actions: { action: 'delete'|'bulk', ids: [...], price?, format? }
      if (b.action) {
        const ids = Array.isArray(b.ids) ? b.ids.map(String).filter(Boolean) : [];
        if (!ids.length) return json(res, 400, { error: "Missing ids" });

        if (b.action === "delete") {
          const n = await deleteEventsByIds(ids);
          return json(res, 200, { ok: true, deleted: n });
        }
        if (b.action === "bulk") {
          if (b.price == null && !b.format) {
            return json(res, 400, { error: "Nothing to update" });
          }
          const n = await bulkUpdateEvents(ids, { price: b.price, format: b.format });
          return json(res, 200, { ok: true, updated: n });
        }
        return json(res, 400, { error: "Unknown action" });
      }
      const payload = {
        tmdb_id: b.tmdb_id || null,
        title: String(b.title || "").trim(),
        poster_url: String(b.poster_url || "").trim() || null,
        format: String(b.format || "mov").trim(),
        price: Number(b.price),
        deposit_text: String(b.deposit_text || "").trim() || null
      };
      if (!payload.title) return json(res, 400, { error: "Missing title" });
      if (!Number.isFinite(payload.price) || payload.price < 0) {
        return json(res, 400, { error: "Invalid price" });
      }

      const result = b.id
        ? await updateEvent(String(b.id).trim(), payload)
        : await createEvent(payload);

      if (!result) return json(res, 404, { error: "Event not found" });
      return json(res, 200, { ok: true, event: result });
    }

    return json(res, 405, { error: "Method not allowed" });
  } catch (error) {
    console.error("admin-events error", error);
    return json(res, 500, { error: "Failed", detail: String(error?.message || error) });
  }
}
