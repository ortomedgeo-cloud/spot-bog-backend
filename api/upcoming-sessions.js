import { listUpcomingSessions } from "../lib/db.js";
import { json } from "../lib/utils.js";

// Public list of upcoming sessions for the reserve page's date/time picker
// (visitors arriving without a session_id). Non-archived events only, today
// (Georgia, UTC+4) and later, soonest first.

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
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });

  try {
    const rows = await listUpcomingSessions();
    return json(res, 200, { ok: true, sessions: rows });
  } catch (error) {
    console.error("upcoming-sessions error", error);
    return json(res, 500, { error: "Failed", detail: String(error?.message || error) });
  }
}
