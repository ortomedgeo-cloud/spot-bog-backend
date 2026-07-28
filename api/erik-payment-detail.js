import { getPaymentDetails } from "../lib/bog.js";
import { json, isErikAuthed } from "../lib/utils.js";

// Live BOG receipt for one order, parsed into a compact human-readable shape.
// The raw BOG payload is a deeply nested blob; this pulls out what actually
// matters for diagnosing a payment: status, method, amounts, and the
// acquirer/issuer response code with its meaning.

// Response-code cheat sheet (from BOG docs / audit experience):
//   122            -> declined by acquirer (BOG side) — escalate to BOG
//   101/103/105/106/107 -> issuer side: limits, funds, expired card
//   "expiration" with no code -> order timed out, nobody attempted payment

function summarize(raw) {
  const b = raw?.body || raw || {};
  const pd = b.payment_detail || {};
  const pu = b.purchase_units || {};

  const code = pd.code || "";
  const codeDesc = pd.code_description || "";
  const rejectReason = b.reject_reason || "";

  let verdict = "";
  if (String(b.order_status?.key || "").includes("complete")) {
    verdict = "Оплачен успешно";
  } else if (code === "122") {
    verdict = "Отклонён эквайером (BOG) — это на стороне банка-эквайера, можно эскалировать в BOG";
  } else if (["101", "103", "105", "106", "107"].includes(String(code))) {
    verdict = "Отклонён банком клиента (лимиты/средства/карта)";
  } else if (rejectReason === "expiration") {
    verdict = "Заказ истёк — оплату никто не начал (воронка/UX, не платёжка)";
  } else if (b.order_status?.key) {
    verdict = `Статус: ${b.order_status.key}`;
  }

  return {
    order_id: b.order_id || "",
    external_order_id: b.external_order_id || "",
    status: b.order_status?.key || "",
    status_localized: b.order_status?.value || "",
    verdict,
    amount_requested: pu.request_amount || "",
    amount_transferred: pu.transfer_amount || "",
    currency: pu.currency_code || "",
    payment_method: pd.transfer_method?.key || "",
    payer: pd.payer_identifier || "",
    card_expiry: pd.card_expiry_date || "",
    response_code: code,
    response_desc: codeDesc,
    reject_reason: rejectReason,
    transaction_id: pd.transaction_id || "",
    created: b.zoned_create_date || b.create_date || "",
    expires: b.zoned_expire_date || b.expire_date || ""
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
  if (!isErikAuthed(req)) return json(res, 401, { error: "Unauthorized" });

  const orderId = String(req.query?.order_id || "").trim();
  if (!orderId) return json(res, 400, { error: "Missing order_id" });

  try {
    const raw = await getPaymentDetails(orderId);
    return json(res, 200, { ok: true, detail: summarize(raw), raw });
  } catch (error) {
    console.error("erik-payment-detail error", error);
    return json(res, 500, { error: "Failed", detail: String(error?.message || error) });
  }
}
