import { sendWhatsappNotification } from "../lib/greenapi.js";
import { findPaymentByBogOrderId, updatePaymentByRowNumber } from "../lib/sheets.js";
import { json, nowIso } from "../lib/utils.js";

export const config = {
  api: { bodyParser: true }
};

function extractBogOrderId(payload) {
  return String(
    payload?.order_id ||
    payload?.id ||
    payload?.payment_order_id ||
    payload?.bog_order_id ||
    ""
  ).trim();
}

function normalizeStatus(payload) {
  const raw = String(
    payload?.order_status ||
    payload?.status ||
    payload?.payment_status ||
    payload?.event ||
    ""
  ).toLowerCase();

  if (/(complete|success|paid)/.test(raw)) return "paid";
  if (/(fail|reject|cancel|declin|error)/.test(raw)) return "failed";
  return "unknown";
}

function buildWhatsappMessage(record) {
  return [
    "✅ Новая оплаченная бронь",
    "",
    `Событие: ${record.event_title || "-"}`,
    `Код события: ${record.event_code || "-"}`,
    `Тип: ${record.type || "-"}`,
    `Стол: ${record.table_no || "-"}`,
    `Гостей: ${record.guests || "-"}`,
    `Имя: ${record.customer_name || "-"}`,
    `Телефон: ${record.customer_phone || "-"}`,
    `Сумма: ${record.price || "-"} GEL`,
    `Внутренний заказ: ${record.internal_order_id || "-"}`,
    `BOG заказ: ${record.bog_order_id || "-"}`
  ].join("\n");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed" });
  }

  try {
    const payload = req.body || {};
    const bogOrderId = extractBogOrderId(payload);
    const normalizedStatus = normalizeStatus(payload);

    if (!bogOrderId) {
      console.error("callback missing bog order id", payload);
      return json(res, 200, { ok: true });
    }

    const found = await findPaymentByBogOrderId(bogOrderId);
    if (!found) {
      console.error("payment row not found for callback", bogOrderId, payload);
      return json(res, 200, { ok: true });
    }

    const current = found.record;
    const updated = {
      ...current,
      created_at: current.created_at || nowIso(),
      internal_order_id: current.internal_order_id || "",
      bog_order_id: current.bog_order_id || bogOrderId,
      status:
        normalizedStatus === "paid"
          ? "paid"
          : normalizedStatus === "failed"
          ? "failed"
          : current.status || "pending",
      event_code: current.event_code || "",
      event_title: current.event_title || "",
      type: current.type || "",
      price: current.price || "",
      table_no: current.table_no || "",
      guests: current.guests || "",
      customer_name: current.customer_name || "",
      customer_phone: current.customer_phone || "",
      tilda_page: current.tilda_page || "",
      green_notified_at: current.green_notified_at || "",
      raw_callback_status: JSON.stringify(payload)
    };

    let whatsappSent = false;

    if (normalizedStatus === "paid" && !current.green_notified_at) {
      await sendWhatsappNotification(buildWhatsappMessage(updated));
      updated.green_notified_at = nowIso();
      whatsappSent = true;
    }

    await updatePaymentByRowNumber(found.rowNumber, updated);

    return json(res, 200, { ok: true, whatsapp_sent: whatsappSent });
  } catch (error) {
    console.error("callback.js error", error);
    return json(res, 200, { ok: true });
  }
}
