import { appendSessionLink } from "../lib/sheets.js";
import { json, isAdminAuthed } from "../lib/utils.js";

// Staff-only endpoint that generates a reserve link and appends it as a new
// session row in the Ссылки (Links) sheet. Gated by the same shared secret
// as manual-booking (MANUAL_BOOKING_SECRET).

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

    const result = await appendSessionLink({
      eid: body.eid,
      date: body.date,
      time: body.time,
      title: body.title,
      poster: body.poster,
      duration: body.duration || 120
    });

    return json(res, 200, result);
  } catch (error) {
    console.error("create-session.js error", error);
    return json(res, 400, {
      error: "Failed to create session",
      detail: String(error?.message || error)
    });
  }
}
