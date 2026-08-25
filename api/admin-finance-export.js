import { getFinanceReport, listFinanceBookings } from "../lib/db.js";
import { buildFinanceWorkbook, financeFileName } from "../lib/finance-xlsx.js";
import { json, isAdminAuthed } from "../lib/utils.js";

// Выгрузка финансового отчёта в Excel.
//   GET ?from=YYYY-MM-DD&to=YYYY-MM-DD -> .xlsx (по умолчанию текущий месяц)
//
// Считается ровно тем же getFinanceReport, что и отчёт на экране: две разные
// формулы для экрана и для бухгалтера — это гарантированное расхождение
// когда-нибудь потом.

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function defaultRange() {
  const now = new Date(Date.now() + 4 * 3600 * 1000);
  const y = now.getUTCFullYear(), m = now.getUTCMonth();
  const first = new Date(Date.UTC(y, m, 1));
  const last = new Date(Date.UTC(y, m + 1, 0));
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
}

export default async function handler(req, res) {
  if (!isAdminAuthed(req)) return json(res, 401, { error: "Unauthorized" });
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });

  try {
    const d = defaultRange();
    const from = ISO.test(String(req.query?.from || "")) ? req.query.from : d.from;
    const to = ISO.test(String(req.query?.to || "")) ? req.query.to : d.to;
    if (from > to) return json(res, 400, { error: "from позже, чем to" });

    const [report, bookings] = await Promise.all([
      getFinanceReport(from, to),
      listFinanceBookings(from, to)
    ]);

    const wb = buildFinanceWorkbook({ report, bookings });
    const buffer = await wb.xlsx.writeBuffer();
    const name = financeFileName(report);

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    res.setHeader("Content-Length", String(buffer.byteLength));
    res.setHeader("Cache-Control", "no-store");
    return res.end(Buffer.from(buffer));
  } catch (error) {
    console.error("admin-finance-export error", error);
    return json(res, 500, { error: "Failed", detail: String(error?.message || error) });
  }
}
