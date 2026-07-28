import { getSession } from "../lib/db.js";
import { json } from "../lib/utils.js";

// Public read-only endpoint for the reserve page. Given ?session_id=s_xxx it
// returns everything the page needs to render: film title, date, time, price,
// deposit text, poster, format. Replaces encoding the poster (and implicitly
// the title/date/price) into the reserve URL - now the link only carries the
// session_id and the page pulls the rest from the DB.

const ALLOWED_ORIGINS = new Set([
  "https://spot-bar.site",
  "https://www.spot-bar.site"
]);

function setCors(req, res) {
  const origin = String(req.headers?.origin || "");
  res.setHeader(
    "Access-Control-Allow-Origin",
    ALLOWED_ORIGINS.has(origin) ? origin : "https://spot-bar.site"
  );
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return json(res, 405, { error: "Method not allowed" });
  }

  const sessionId = String(req.query?.session_id || "").trim();
  if (!sessionId) {
    return json(res, 400, { error: "Missing session_id" });
  }

  try {
    const s = await getSession(sessionId);
    if (!s) {
      return json(res, 404, { error: "Session not found" });
    }

    return json(res, 200, {
      ok: true,
      session_id: s.id,
      title: s.title,
      date: s.date,
      time: s.time,
      price: Number(s.price),
      deposit_text: s.deposit_text || "",
      poster_url: s.poster_url || "",
      format: s.format
    });
  } catch (error) {
    console.error("session-info.js error", error);
    return json(res, 500, {
      error: "Failed to load session",
      detail: String(error?.message || error)
    });
  }
}
