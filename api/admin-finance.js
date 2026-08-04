import { getFinanceReport, saveFinanceSettings } from "../lib/db.js";
import { json, isAdminAuthed } from "../lib/utils.js";

// Финансовый отчёт.
//   GET ?from=YYYY-MM-DD&to=YYYY-MM-DD  -> отчёт за период (по умолчанию текущий месяц)
//   POST { acquiring_fee_pct, tax_pct } -> ставки комиссии и налога
//
// Отчёт считается по броням и заказам, которые уже проходят через систему.
// Ставки — настройка, а не константа: комиссия зависит от договора с банком,
// налоговый режим — от статуса ИП.

function safeBody(body) {
  if (!body) return {};
  if (typeof body === "object") return body;
  try { return JSON.parse(body); } catch { return {}; }
}

// Месяц по умолчанию считаем в грузинском времени (UTC+4): иначе первого
// числа около полуночи отчёт открывался бы за прошлый месяц.
function defaultRange() {
  const now = new Date(Date.now() + 4 * 3600 * 1000);
  const y = now.getUTCFullYear(), m = now.getUTCMonth();
  const first = new Date(Date.UTC(y, m, 1));
  const last = new Date(Date.UTC(y, m + 1, 0));
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default async function handler(req, res) {
  if (!isAdminAuthed(req)) return json(res, 401, { error: "Unauthorized" });

  try {
    if (req.method === "POST") {
      const b = safeBody(req.body);
      const fee = Number(b.acquiring_fee_pct);
      const tax = Number(b.tax_pct);
      if (b.acquiring_fee_pct != null && (!Number.isFinite(fee) || fee < 0 || fee > 100)) {
        return json(res, 400, { error: "Bad acquiring_fee_pct" });
      }
      if (b.tax_pct != null && (!Number.isFinite(tax) || tax < 0 || tax > 100)) {
        return json(res, 400, { error: "Bad tax_pct" });
      }
      const settings = await saveFinanceSettings(b);
      return json(res, 200, { ok: true, settings });
    }

    if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });

    const d = defaultRange();
    const from = ISO.test(String(req.query?.from || "")) ? req.query.from : d.from;
    const to = ISO.test(String(req.query?.to || "")) ? req.query.to : d.to;
    if (from > to) return json(res, 400, { error: "from позже, чем to" });

    return json(res, 200, { ok: true, ...(await getFinanceReport(from, to)) });
  } catch (error) {
    console.error("admin-finance error", error);
    return json(res, 500, { error: "Failed", detail: String(error?.message || error) });
  }
}
