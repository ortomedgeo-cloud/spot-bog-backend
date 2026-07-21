import { appendManualBooking } from "../lib/sheets.js";
import { json, isAdminAuthed } from "../lib/utils.js";

// Staff-only endpoint for entering bookings made by phone / social / walk-in,
// so employees never touch the sheet directly. Writes a Bookings row in the
// same shape as the paid flow (see appendManualBooking).
//
// Access is gated by a shared secret in MANUAL_BOOKING_SECRET: the staff page
// passes it as ?key=... (query) or an X-Manual-Key header. This is what makes
// the "secret URL" actually private rather than just unlisted.

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "https://spot-bar.site");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Manual-Key");
}

function safeBody(body) {
  if (!body) return {};
  if (typeof body === "object") return body;
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed" });
  }

  if (!isAdminAuthed(req)) {
    return json(res, 401, { error: "Unauthorized" });
  }

  try {
    const body = safeBody(req.body);

    const result = await appendManualBooking({
      event_code: body.eid,
      date: body.date,
      time: body.time,
      table_no: body.table,
      customer_name: body.name,
      customer_phone: body.phone,
      guests: body.guests,
      amount: body.amount,
      payment_status: body.payment_status
    });

    return json(res, 200, result);
  } catch (error) {
    console.error("manual-booking.js error", error);

    if (error?.code === "TABLE_TAKEN") {
      return json(res, 409, { error: "TABLE_TAKEN", detail: error.message });
    }

    return json(res, 400, {
      error: "Failed to create booking",
      detail: String(error?.message || error)
    });
  }
}
