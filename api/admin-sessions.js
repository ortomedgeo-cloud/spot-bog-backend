import {
  listSessions, createSession, updateSession, setSessionTitle,
  deleteSessionsByIds, restoreSessionsByIds, reassignSessionsEvent
} from "../lib/db.js";
import { json, isAdminAuthed } from "../lib/utils.js";

// GET  -> all sessions (joined with event) newest first
// POST -> create session { event_id, date (DD-MM-YYYY), time (HH:MM), duration? }

function safeBody(body) {
  if (!body) return {};
  if (typeof body === "object") return body;
  try { return JSON.parse(body); } catch { return {}; }
}

export default async function handler(req, res) {
  if (!isAdminAuthed(req)) return json(res, 401, { error: "Unauthorized" });

  try {
    if (req.method === "GET") {
      const sessions = await listSessions();
      return json(res, 200, { ok: true, sessions });
    }

    if (req.method === "POST") {
      const b = safeBody(req.body);

      // Название для архивной записи: { action:'title', id, title }
      if (b.action === "title") {
        const sid = String(b.id || "").trim();
        const title = String(b.title || "").trim();
        if (!sid || !title) return json(res, 400, { error: "Missing id or title" });
        const row = await setSessionTitle(sid, title);
        return row
          ? json(res, 200, { ok: true, session: row })
          : json(res, 404, { error: "Session not found" });
      }

      // Batch actions: { action: 'delete'|'reassign', ids: [...], event_id? }
      if (b.action) {
        const ids = Array.isArray(b.ids) ? b.ids.map(String).filter(Boolean) : [];
        if (!ids.length) return json(res, 400, { error: "Missing ids" });

        if (b.action === "delete") {
          // Мягко: сеанс уходит из расписания, но остаётся в архиве с бронями.
          const n = await deleteSessionsByIds(ids);
          return json(res, 200, { ok: true, deleted: n });
        }
        if (b.action === "restore") {
          const n = await restoreSessionsByIds(ids);
          return json(res, 200, { ok: true, restored: n });
        }
        if (b.action === "reassign") {
          const eid = String(b.event_id || "").trim();
          if (!eid) return json(res, 400, { error: "Missing event_id" });
          const n = await reassignSessionsEvent(ids, eid);
          return json(res, 200, { ok: true, updated: n });
        }
        return json(res, 400, { error: "Unknown action" });
      }
      const eventId = String(b.event_id || "").trim();
      const date = String(b.date || "").trim();
      const time = String(b.time || "").trim();
      const duration = Number(b.duration) || 120;

      // body.id => update existing session (reassign event / fix date/time)
      if (b.id) {
        const session = await updateSession(String(b.id).trim(), {
          event_id: eventId || null,
          date: date || null,
          time: time || null,
          duration: Number(b.duration) || null,
          // undefined = поле не трогаем; пустая строка = сбросить на постер события
          poster_url: b.poster_url === undefined ? undefined : String(b.poster_url || "").trim()
        });
        if (!session) return json(res, 404, { error: "Session not found" });
        return json(res, 200, { ok: true, session, updated: true });
      }

      if (!eventId) return json(res, 400, { error: "Missing event_id" });
      if (!date) return json(res, 400, { error: "Missing date" });
      if (!/^\d{1,2}:\d{2}$/.test(time)) return json(res, 400, { error: "Invalid time (HH:MM)" });

      const session = await createSession({
        event_id: eventId, date, time, duration,
        poster_url: String(b.poster_url || "").trim() || null
      });
      return json(res, 200, { ok: true, session });
    }

    return json(res, 405, { error: "Method not allowed" });
  } catch (error) {
    console.error("admin-sessions error", error);
    return json(res, 500, { error: "Failed", detail: String(error?.message || error) });
  }
}
