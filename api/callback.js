import {
  findPaymentByBogOrderId,
  findPaymentByInternalOrderId,
  updatePayment,
  createBookingIfNotExists
} from "../lib/db.js";
import { notify } from "../lib/notify.js";
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

  if (raw.includes("complete") || raw.includes("paid") || raw.includes("success")) {
    return "paid";
  }
  if (raw.includes("reject") || raw.includes("fail") || raw.includes("cancel")) {
    return "failed";
  }
  return "unknown";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed" });
  }

  let bogOrderId = "";
  let internalOrderId = "";

  try {
    const payload = normalizeBody(req.body);
    console.log("BOG RAW CALLBACK", JSON.stringify(payload, null, 2));

    bogOrderId = extractBogOrderId(payload);
    internalOrderId = extractInternalOrderId(payload);
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

    let payment = null;
    if (bogOrderId) {
      payment = await findPaymentByBogOrderId(bogOrderId);
    }
    if (!payment && internalOrderId) {
      payment = await findPaymentByInternalOrderId(internalOrderId);
    }

    if (!payment) {
      console.error("callback payment not found", { bogOrderId, internalOrderId });
      return json(res, 200, { ok: true });
    }

    const alreadyPaid = payment.status === "paid";

    if (normalizedStatus === "paid" && !alreadyPaid) {
      // 1) Notify WhatsApp once. green_notified_at guards against re-sending on
      //    a duplicate callback.
      let greenNotifiedAt = payment.green_notified_at;

      if (!greenNotifiedAt) {
        const text =
`✅ Новая оплаченная бронь

Событие: ${payment.event_title}
Стол: ${payment.table_label}
Гостей: ${payment.guests}
Имя: ${payment.guest_name}
Контакт: ${payment.guest_phone}
Сумма: ${payment.amount} GEL
BOG order: ${bogOrderId || payment.bog_order_id}
Booking ID: ${payment.internal_order_id}`;

        try {
          await notify(text);
          greenNotifiedAt = new Date().toISOString();
          // persist the notify timestamp immediately so a retry won't re-send
          await updatePayment(payment.id, {
            bog_order_id: bogOrderId || payment.bog_order_id,
            green_notified_at: greenNotifiedAt,
            raw_callback: payload
          });
        } catch (error) {
          console.error("whatsapp notification failed", error);
        }
      }

      // 2) Create the booking (idempotent). Uses the internal_order_id as the
      //    booking id, so a duplicate callback can't double-book. The unique
      //    (session_id, table_label) constraint is the final guard.
      try {
        await createBookingIfNotExists({
          id: payment.internal_order_id,
          session_id: payment.session_id,
          table_label: payment.table_label,
          guest_name: payment.guest_name,
          guest_phone: payment.guest_phone,
          guests: payment.guests,
          amount: payment.amount,
          payment_status: "paid",
          source: "online",
          wa_status: greenNotifiedAt || null
        });
      } catch (error) {
        console.error("create booking failed", error);
        throw error; // don't mark handled; BOG will retry
      }
    }

    // 3) Flip payment status last.
    await updatePayment(payment.id, {
      bog_order_id: bogOrderId || payment.bog_order_id,
      status:
        normalizedStatus === "paid"
          ? "paid"
          : normalizedStatus === "failed"
            ? "failed"
            : payment.status,
      raw_callback: payload
    });

    return json(res, 200, { ok: true });
  } catch (error) {
    console.error("CALLBACK_FATAL", {
      message: error?.message,
      stack: error?.stack,
      bogOrderId,
      internalOrderId
    });
    return json(res, 500, { ok: false, error: "internal_error" });
  }
}
