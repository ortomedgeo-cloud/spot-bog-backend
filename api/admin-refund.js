import { findPaymentByInternalOrderId, updatePayment, syncRefundState } from "../lib/db.js";
import { refundBogOrder, getPaymentDetails, parseRefundState } from "../lib/bog.js";
import { json, isAdminAuthed } from "../lib/utils.js";

// Возвраты по оплаченным бронированиям.
//
//   GET  ?id=<internal_order_id>       -> сверить статус возврата с BOG
//                                          (страховка, если вебхук не пришёл)
//   POST { id, amount? }               -> запросить возврат в BOG
//                                          (amount не указан -> полный возврат)

function safeBody(body) {
  if (!body) return {};
  if (typeof body === "object") return body;
  try { return JSON.parse(body); } catch { return {}; }
}

export default async function handler(req, res) {
  if (!isAdminAuthed(req)) return json(res, 401, { error: "Unauthorized" });

  if (req.method === "GET") {
    const id = String(req.query?.id || "").trim();
    if (!id) return json(res, 400, { error: "Missing id" });

    try {
      const payment = await findPaymentByInternalOrderId(id);
      if (!payment) return json(res, 404, { error: "Payment not found" });
      if (!payment.bog_order_id) return json(res, 200, { ok: true, payment });

      const raw = await getPaymentDetails(payment.bog_order_id);
      const { statusKey, refundAmount } = parseRefundState(raw?.body || raw);
      const updated = await syncRefundState(payment, { statusKey, refundAmount, rawCallback: raw });
      return json(res, 200, { ok: true, payment: updated || payment });
    } catch (error) {
      console.error("admin-refund sync error", error);
      return json(res, 500, { error: "Failed", detail: String(error?.message || error) });
    }
  }

  if (req.method === "POST") {
    const b = safeBody(req.body);
    const id = String(b.id || "").trim();
    if (!id) return json(res, 400, { error: "Missing id" });

    try {
      const payment = await findPaymentByInternalOrderId(id);
      if (!payment) return json(res, 404, { error: "Payment not found" });
      if (payment.status !== "paid") {
        return json(res, 409, { error: "NOT_PAID", detail: "Платёж не в статусе paid" });
      }
      if (!payment.bog_order_id) {
        return json(res, 409, { error: "NO_BOG_ORDER", detail: "Нет BOG order id" });
      }
      if (payment.refund_status === "requested") {
        return json(res, 409, {
          error: "REFUND_PENDING",
          detail: "Предыдущий возврат ещё не подтверждён BOG. Проверьте статус и повторите позже."
        });
      }
      if (payment.refund_status === "refunded") {
        return json(res, 409, { error: "ALREADY_REFUNDED" });
      }

      const alreadyRefunded = Number(payment.refunded_amount) || 0;
      const remaining = Number(payment.amount) - alreadyRefunded;
      if (remaining <= 0) return json(res, 409, { error: "NOTHING_TO_REFUND" });

      let amount = null;
      if (b.amount != null && String(b.amount).trim() !== "") {
        amount = Number(b.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
          return json(res, 400, { error: "BAD_AMOUNT" });
        }
        if (amount > remaining) {
          return json(res, 400, { error: "AMOUNT_TOO_HIGH", detail: `Доступно к возврату: ${remaining}` });
        }
      }

      const result = await refundBogOrder(payment.bog_order_id, amount != null ? { amount } : {});

      const updated = await updatePayment(payment.id, {
        refund_status: "requested",
        refund_requested_amount: amount != null ? amount : remaining,
        refund_action_id: result.actionId || null,
        refund_requested_at: new Date().toISOString()
      });

      return json(res, 200, { ok: true, payment: updated, bog: result });
    } catch (error) {
      console.error("admin-refund error", error);
      return json(res, 500, { error: "Failed", detail: String(error?.message || error) });
    }
  }

  return json(res, 405, { error: "Method not allowed" });
}
