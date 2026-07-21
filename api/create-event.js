import { appendEvent } from "../lib/sheets.js";
import { json, isAdminAuthed } from "../lib/utils.js";

// Staff-only endpoint to add a new event (film/dinner) to the events sheet.
// Gated by MANUAL_BOOKING_SECRET, same as the other admin endpoints.

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

    const result = await appendEvent({
      eid: body.eid,
      title: body.title,
      type: body.type,
      price: body.price,
      deposit_text: body.deposit_text
    });

    return json(res, 200, result);
  } catch (error) {
    console.error("create-event.js error", error);

    if (error?.code === "EID_EXISTS") {
      return json(res, 409, { error: "EID_EXISTS", detail: error.message });
    }

    return json(res, 400, {
      error: "Failed to create event",
      detail: String(error?.message || error)
    });
  }
}
