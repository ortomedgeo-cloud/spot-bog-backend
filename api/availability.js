import { getBookedTablesForSession } from "../lib/sheets.js";
import { json } from "../lib/utils.js";

// Read-only endpoint for the Tilda seat widget. Given eid + date (both taken
// straight from the reserve page URL, e.g. ?eid=film10&date=10-07-2026), it
// returns the tables booked for that exact screening - matched against
// columns L (eid) and A (Date) in the Bookings sheet. Never writes anything.
//
// eid alone is not enough: the same eid gets reused across different films
// (only the poster/title changes), so eid+date together is what uniquely
// identifies one screening.

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "https://spot-bar.site");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return json(res, 405, { error: "Method not allowed" });
  }

  try {
    const eid = String(req.query?.eid || "").trim();
    const date = String(req.query?.date || "").trim();

    if (!eid || !date) {
      return json(res, 400, { error: "Missing eid or date" });
    }

    const booked = await getBookedTablesForSession(eid, date);

    return json(res, 200, { ok: true, booked });
  } catch (error) {
    console.error("availability.js error", error);

    return json(res, 500, {
      error: "Failed to read availability",
      detail: String(error?.message || error)
    });
  }
}
