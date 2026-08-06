import { getSessionsWithBookingsRange } from "../lib/db.js";
import { json, isAdminAuthed } from "../lib/utils.js";

// Расписание за период для главной вкладки админки.
// По умолчанию — текущая неделя с понедельника: расписание живёт неделями,
// и администратору нужно видеть не только сегодня, но и что будет дальше.
//   GET ?from=YYYY-MM-DD&to=YYYY-MM-DD

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function currentWeek() {
  // «Сегодня» по грузинскому времени, иначе после полуночи неделя съезжает.
  const now = new Date(Date.now() + 4 * 3600 * 1000);
  const dow = (now.getUTCDay() + 6) % 7;            // 0 = понедельник
  const monday = new Date(now); monday.setUTCDate(now.getUTCDate() - dow);
  const sunday = new Date(monday); sunday.setUTCDate(monday.getUTCDate() + 6);
  return { from: monday.toISOString().slice(0, 10), to: sunday.toISOString().slice(0, 10) };
}

export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
  if (!isAdminAuthed(req)) return json(res, 401, { error: "Unauthorized" });

  try {
    const w = currentWeek();
    const from = ISO.test(String(req.query?.from || "")) ? req.query.from : w.from;
    const to = ISO.test(String(req.query?.to || "")) ? req.query.to : w.to;
    const sessions = await getSessionsWithBookingsRange(from, to);
    return json(res, 200, { ok: true, from, to, sessions });
  } catch (error) {
    console.error("admin-week error", error);
    return json(res, 500, { error: "Failed", detail: String(error?.message || error) });
  }
}
