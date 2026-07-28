import { getBookedTables } from "../lib/db.js";
import { json } from "../lib/utils.js";

// Read-only endpoint for the Tilda seat widget. Given ?session_id=s_xxx it
// returns the tables already booked for that session, from Postgres. The
// session_id uniquely identifies one screening (date/time are intrinsic to it),
// so no more eid+date pair.

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

  try {
    const sessionId = String(req.query?.session_id || "").trim();
    if (!sessionId) {
      return json(res, 400, { error: "Missing session_id" });
    }

    const booked = await getBookedTables(sessionId);
    return json(res, 200, { ok: true, booked });
  } catch (error) {
    console.error("availability.js error", error);
    return json(res, 500, {
      error: "Failed to read availability",
      detail: String(error?.message || error)
    });
  }
}
