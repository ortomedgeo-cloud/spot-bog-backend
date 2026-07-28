import { getSessionsWithBookingsForDate } from "../lib/db.js";
import { json, isAdminAuthed } from "../lib/utils.js";

// Today's sessions with their bookings for the dashboard tab. ?date=YYYY-MM-DD
// overrides (for looking at other days); defaults to today in Georgia (UTC+4).

export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
  if (!isAdminAuthed(req)) return json(res, 401, { error: "Unauthorized" });

  try {
    let iso = String(req.query?.date || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      // "today" in UTC+4
      const now = new Date(Date.now() + 4 * 3600 * 1000);
      iso = now.toISOString().slice(0, 10);
    }
    const sessions = await getSessionsWithBookingsForDate(iso);
    return json(res, 200, { ok: true, date: iso, sessions });
  } catch (error) {
    console.error("admin-today error", error);
    return json(res, 500, { error: "Failed", detail: String(error?.message || error) });
  }
}
