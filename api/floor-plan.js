import { getPublicFloorPlan } from "../lib/db.js";
import { json } from "../lib/utils.js";

// Публичный план зала для страницы брони.

const ALLOWED_ORIGINS = new Set(["https://spot-bar.site", "https://www.spot-bar.site"]);

function setCors(req, res) {
  const origin = String(req.headers?.origin || "");
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGINS.has(origin) ? origin : "https://spot-bar.site");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });

  try {
    // session_id важнее event_id: рассадка может быть задана на один сеанс.
    const eventId = String(req.query?.event_id || "").trim() || undefined;
    const sessionId = String(req.query?.session_id || "").trim() || undefined;
    return json(res, 200, { ok: true, ...(await getPublicFloorPlan(eventId, sessionId)) });
  } catch (error) {
    console.error("floor-plan error", error);
    return json(res, 500, { error: "Failed", detail: String(error?.message || error) });
  }
}
