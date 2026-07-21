import { getSessions } from "../lib/sheets.js";
import { json } from "../lib/utils.js";

// Read-only endpoint for the staff manual-booking form. Returns the list of
// films (from the events sheet) together with their available sessions
// (parsed from the Ссылки/Links sheet), so the form can offer a film dropdown
// and then only enable the dates/times that actually have a session.
//
// Shape: { ok: true, films: [ { eid, title, sessions: [ {date, time} ] } ] }

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
    const films = await getSessions();
    return json(res, 200, { ok: true, films });
  } catch (error) {
    console.error("sessions.js error", error);
    return json(res, 500, {
      error: "Failed to read sessions",
      detail: String(error?.message || error)
    });
  }
}
