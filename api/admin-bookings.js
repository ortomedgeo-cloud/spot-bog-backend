import {
  getSessionDetail,
  updateBooking,
  deleteBooking,
  moveBooking,
  listPastSessions,
  searchGuests
} from "../lib/db.js";
import { json, isAdminAuthed } from "../lib/utils.js";
import { looksLikePhone } from "../lib/greenapi.js";

// Брони для администратора.
//
//   GET ?session_id=s_x          -> сеанс целиком: план зала, брони, итоги
//   GET ?archive=1&limit&offset&q-> прошедшие сеансы (архив)
//   GET ?guest=текст             -> поиск гостя по всем броням
//
//   POST { action:'update', id, ... }        -> правка брони
//   POST { action:'move',   id, session_id } -> перенос на другой сеанс
//   POST { action:'delete', id }             -> отмена брони

const STATUSES = ["paid", "deposit", "unpaid"];

function safeBody(body) {
  if (!body) return {};
  if (typeof body === "object") return body;
  try { return JSON.parse(body); } catch { return {}; }
}

export default async function handler(req, res) {
  if (!isAdminAuthed(req)) return json(res, 401, { error: "Unauthorized" });

  try {
    if (req.method === "GET") {
      const guest = String(req.query?.guest || "").trim();
      if (guest) {
        return json(res, 200, { ok: true, guests: await searchGuests(guest) });
      }

      if (req.query?.archive) {
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
        const offset = Math.max(0, Number(req.query.offset) || 0);
        const sessions = await listPastSessions({ limit, offset, q: req.query.q || "" });
        return json(res, 200, { ok: true, sessions, limit, offset });
      }

      const sessionId = String(req.query?.session_id || "").trim();
      if (!sessionId) return json(res, 400, { error: "Missing session_id" });
      const detail = await getSessionDetail(sessionId);
      if (!detail) return json(res, 404, { error: "Session not found" });
      return json(res, 200, { ok: true, ...detail });
    }

    if (req.method === "POST") {
      const b = safeBody(req.body);
      const id = String(b.id || "").trim();
      if (!id) return json(res, 400, { error: "Missing id" });

      if (b.action === "delete") {
        const ok = await deleteBooking(id);
        return ok ? json(res, 200, { ok: true }) : json(res, 404, { error: "Booking not found" });
      }

      if (b.action === "move") {
        const target = String(b.session_id || "").trim();
        if (!target) return json(res, 400, { error: "Missing session_id" });
        const bk = await moveBooking(id, target);
        return bk ? json(res, 200, { ok: true, booking: bk }) : json(res, 404, { error: "Booking not found" });
      }

      if (b.action === "update") {
        // Телефон не обязателен (бронь могла прийти из директа), но если его
        // правят — он должен остаться настоящим, иначе подтверждение уйдёт в никуда.
        if (b.guest_phone && !looksLikePhone(b.guest_phone)) {
          return json(res, 400, { error: "INVALID_PHONE", detail: "Похоже, это не номер телефона" });
        }
        if (b.payment_status && !STATUSES.includes(b.payment_status)) {
          return json(res, 400, { error: "Bad payment_status" });
        }
        const bk = await updateBooking(id, b);
        return bk ? json(res, 200, { ok: true, booking: bk }) : json(res, 404, { error: "Booking not found" });
      }

      return json(res, 400, { error: "Unknown action" });
    }

    return json(res, 405, { error: "Method not allowed" });
  } catch (error) {
    if (error?.code === "TABLE_TAKEN") {
      return json(res, 409, { error: "TABLE_TAKEN", detail: error.message });
    }
    console.error("admin-bookings error", error);
    return json(res, 500, { error: "Failed", detail: String(error?.message || error) });
  }
}
