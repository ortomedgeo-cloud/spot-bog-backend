import { listPaymentsSince } from "../lib/db.js";
import { json, isErikAuthed } from "../lib/utils.js";

// Payments list for the Erik panel (DB only — fast). BOG live details are
// fetched per-order on click via /api/erik-payment-detail. ?days=30 default.

export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
  if (!isErikAuthed(req)) return json(res, 401, { error: "Unauthorized" });

  try {
    const days = Math.min(365, Math.max(1, Number(req.query?.days) || 30));
    const payments = await listPaymentsSince(days);
    return json(res, 200, { ok: true, days, payments });
  } catch (error) {
    console.error("erik-payments error", error);
    return json(res, 500, { error: "Failed", detail: String(error?.message || error) });
  }
}
