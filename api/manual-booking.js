import { getSession, createBooking } from "../lib/db.js";
import { json, isAdminAuthed } from "../lib/utils.js";
import crypto from "crypto";

// Staff manual booking (walk-in / phone / social) — writes straight to
// Postgres. The UNIQUE(session_id, table_label) constraint makes double
// booking impossible at the DB level (including racing an online payment).

function safeBody(body) {
  if (!body) return {};
  if (typeof body === "object") return body;
  try { return JSON.parse(body); } catch { return {}; }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  if (!isAdminAuthed(req)) return json(res, 401, { error: "Unauthorized" });

  try {
    const b = safeBody(req.body);
    const sessionId = String(b.session_id || "").trim();
    const table = String(b.table || b.table_no || "").replace(/\s+/g, " ").trim();

    if (!sessionId) return json(res, 400, { error: "Missing session_id" });
    if (!table) return json(res, 400, { error: "Missing table" });

    const session = await getSession(sessionId);
    if (!session) return json(res, 404, { error: "Session not found" });

    const booking = await createBooking({
      id: `manual_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
      session_id: sessionId,
      table_label: table,
      guest_name: String(b.name || "").trim() || null,
      guest_phone: String(b.phone || "").trim() || null,
      guests: Number(b.guests) || null,
      amount: Number(b.amount) || null,
      payment_status: ["paid", "deposit", "unpaid"].includes(b.payment_status)
        ? b.payment_status
        : "unpaid",
      source: "manual"
    });

    return json(res, 200, {
      ok: true,
      booking_id: booking.id,
      table: booking.table_label,
      session_id: sessionId,
      title: session.title,
      date: session.date,
      time: session.time
    });
  } catch (error) {
    if (error?.code === "TABLE_TAKEN") {
      return json(res, 409, { error: "TABLE_TAKEN", detail: error.message });
    }
    console.error("manual-booking error", error);
    return json(res, 500, { error: "Failed", detail: String(error?.message || error) });
  }
}
