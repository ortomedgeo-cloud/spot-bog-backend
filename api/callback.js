import {
  appendBookingRowIfNotExists,
  findPaymentRowByBogOrderId,
  findPaymentRowByInternalOrderId,
  updatePaymentStatus
} from "../lib/sheets.js";
import { sendWhatsappNotification } from "../lib/greenapi.js";
import { json } from "../lib/utils.js";

export const config = {
  api: { bodyParser: true }
};

function normalizeBody(body) {
  let payload = body;

  if (!payload) return {};

  if (Buffer.isBuffer(payload)) {
    try {
      payload = JSON.parse(payload.toString("utf8"));
    } catch {
      return {};
    }
  }

  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      return {};
    }
  }

  if (typeof payload !== "object") return {};

  return payload;
}

function extractBogOrderId(payload) {
  const id =
    payload?.body?.order_id ??
    payload?.body?.id ??
    payload?.order_id ??
    payload?.id;

  return id ? String(id).trim() : "";
}

function extractInternalOrderId(payload) {
  const id =
    payload?.body?.external_order_id ??
    payload?.external_order_id;

  return id ? String(id).trim() : "";
}

function normalizeStatus(payload) {
  const raw = String(
    payload?.body?.order_status?.key ??
    payload?.body?.status ??
    payload?.status ??
    ""
  ).toLowerCase();

  if (
    raw.includes("complete") ||
    raw.includes("paid") ||
    raw.includes("success")
  ) {
    return "paid";
  }

  if (
    raw.includes("reject") ||
    raw.includes("fail") ||
    raw.includes("cancel")
  ) {
    return "failed";
  }

  return "unknown";
}

function formatWaStatusOk(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `OK ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
    date.getSeconds()
  )}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed" });
  }

  try {
    const payload = normalizeBody(req.body);

    console.log("BOG RAW CALLBACK", JSON.stringify(payload, null, 2));

    const bogOrderId = extractBogOrderId(payload);
    const internalOrderId = extractInternalOrderId(payload);
    const normalizedStatus = normalizeStatus(payload);

    console.log("callback parsed", {
      bogOrderId,
      internalOrderId,
      normalizedStatus,
      rawOrderStatus: payload?.body?.order_status?.key || null
    });

    if (!bogOrderId && !internalOrderId) {
      console.error("callback missing order ids", payload);
      return json(res, 200, { ok: true });
    }

    let found = null;

    if (bogOrderId) {
      found = await findPaymentRowByBogOrderId(bogOrderId);
    }

    if (!found && internalOrderId) {
      found = await findPaymentRowByInternalOrderId(internalOrderId);
    }

    if (!found) {
      console.error("callback payment row not found", {
        bogOrderId,
        internalOrderId,
        payload
      });
      return json(res, 200, { ok: true });
    }

    const current = found.data;

    const next = {
      ...current,
      bog_order_id: bogOrderId || current.bog_order_id,
      status:
        normalizedStatus === "paid"
          ? "paid"
          : normalizedStatus === "failed"
            ? "failed"
            : current.status,
      raw_callback_status: JSON.stringify(payload)
    };

    let waStatus = current.green_notified_at || "";

    if (normalizedStatus === "paid" && current.status !== "paid") {
      if (!current.green_notified_at) {
        const text =
`✅ Новая оплаченная бронь

Событие: ${current.event_title}
ID события: ${current.event_code}
Стол: ${current.table_no}
Гостей: ${current.guests}
Имя: ${current.customer_name}
Контакт: ${current.customer_phone}
Сумма: ${current.price} GEL
BOG order: ${bogOrderId || current.bog_order_id}
Booking ID: ${current.internal_order_id}`;

        try {
          await sendWhatsappNotification(text);
          waStatus = formatWaStatusOk(new Date());
          next.green_notified_at = new Date().toISOString();
        } catch (error) {
          console.error("whatsapp notification failed", error);
        }
      }

      try {
        await appendBookingRowIfNotExists({
          booking_id: current.internal_order_id,
          reserve_url: current.tilda_page,
          table_no: current.table_no,
          customer_name: current.customer_name,
          customer_phone: current.customer_phone,
          guests: current.guests,
          amount: current.price,
          event_code: current.event_code,
          wa_status: waStatus,
          status: "list"
        });
      } catch (error) {
        console.error("append booking failed", error);
      }
    }

    await updatePaymentStatus(found.sheetRowNumber, next);

    return json(res, 200, { ok: true });
  } catch (error) {
    console.error("callback.js error", error);
    return json(res, 200, { ok: true });
  }
}