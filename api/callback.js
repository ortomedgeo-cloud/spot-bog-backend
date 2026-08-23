import {
  findPaymentByBogOrderId,
  findPaymentByInternalOrderId,
  updatePayment,
  createBookingIfNotExists,
  syncRefundState
} from "../lib/db.js";
import { notify, notifyGuest } from "../lib/notify.js";
import { escapeHtml } from "../lib/telegram.js";
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

  if (raw.includes("refunded_partially")) return "refunded_partially";
  if (raw.includes("refunded")) return "refunded";
  if (raw.includes("refund")) return "refund_requested";

  if (raw.includes("complete") || raw.includes("paid") || raw.includes("success")) {
    return "paid";
  }
  if (raw.includes("reject") || raw.includes("fail") || raw.includes("cancel")) {
    return "failed";
  }
  return "unknown";
}

function extractRefundAmount(payload) {
  const v = payload?.body?.purchase_units?.refund_amount ?? payload?.purchase_units?.refund_amount;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const REFUND_STATUSES = new Set(["refund_requested", "refunded", "refunded_partially"]);

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

    if (REFUND_STATUSES.has(normalizedStatus)) {
      await syncRefundState(payment, {
        statusKey: normalizedStatus,
        refundAmount: extractRefundAmount(payload),
        rawCallback: payload
      });
      return json(res, 200, { ok: true });
    }

    const alreadyPaid = payment.status === "paid";

    if (normalizedStatus === "paid" && !alreadyPaid) {
      // 1) Create the booking FIRST — this is the atomic guard against
      //    double-booking (unique (session_id, table_label) at the DB level).
      //    Several guests can race to pay for the same table since payment.js
      //    doesn't hold the seat; only one insert here can win. We must not
      //    tell anyone "confirmed" until we actually know who won.
      let tableTaken = false;
      try {
        await createBookingIfNotExists({
          id: payment.internal_order_id,
          session_id: payment.session_id,
          table_label: payment.table_label,
          guest_name: payment.guest_name,
          guest_phone: payment.guest_phone,
          guest_instagram: payment.guest_instagram,
          guests: payment.guests,
          amount: payment.amount,
          payment_status: "paid",
          source: "online",
          wa_status: null
        });
      } catch (error) {
        if (error?.code !== "TABLE_TAKEN") {
          console.error("create booking failed", error);
          throw error; // unexpected DB error — don't mark handled, BOG will retry
        }
        tableTaken = true;
      }

      // green_notified_at guards against re-sending on a duplicate callback
      // (BOG retry), for either outcome below.
      if (!payment.green_notified_at) {
        if (tableTaken) {
          // Money was captured by BOG but the table was already taken by a
          // faster payment — do NOT send the "confirmed" messages. Flag it
          // for staff to manually reseat or refund instead.
          console.error("callback: table taken after payment captured", {
            internalOrderId: payment.internal_order_id,
            sessionId: payment.session_id,
            tableLabel: payment.table_label
          });
          try {
            await notify(
`⚠️ Оплата прошла, но стол уже занят другой бронью

Событие: ${escapeHtml(payment.event_title)}
Стол: ${escapeHtml(payment.table_label)}
Гостей: ${payment.guests}
Имя: ${escapeHtml(payment.guest_name)}
Телефон: ${escapeHtml(payment.guest_phone)}
Сумма: ${payment.amount} GEL
BOG order: ${escapeHtml(bogOrderId || payment.bog_order_id)}
Booking ID: ${escapeHtml(payment.internal_order_id)}

Деньги списаны, брони нет — пересадите гостя вручную или сделайте возврат.`
            );
          } catch (error) {
            console.error("conflict notification failed", error);
          }
        } else {
          const text =
`✅ Новая оплаченная бронь

Событие: ${escapeHtml(payment.event_title)}
Стол: ${escapeHtml(payment.table_label)}
Гостей: ${payment.guests}
Имя: ${escapeHtml(payment.guest_name)}
Телефон: ${escapeHtml(payment.guest_phone)}${payment.guest_instagram ? `\nInstagram: ${escapeHtml(payment.guest_instagram)}` : ""}
Сумма: ${payment.amount} GEL
BOG order: ${escapeHtml(bogOrderId || payment.bog_order_id)}
Booking ID: ${escapeHtml(payment.internal_order_id)}`;

          try {
            await notify(text);
          } catch (error) {
            console.error("whatsapp notification failed", error);
          }

          // Подтверждение самому гостю на номер из брони. Если в контакте
          // инстаграм, а не телефон, notifyGuest тихо вернёт not_a_phone —
          // это штатная ситуация, а не сбой.
          try {
            const guestText =
`Здравствуйте${payment.guest_name ? ", " + payment.guest_name : ""}! Ваша бронь в SPOT. подтверждена ✅

${payment.event_title}
Стол: ${payment.table_label}
Гостей: ${payment.guests}
Оплачено: ${payment.amount} GEL

Адрес: ул. Реджеба Ниджарадзе 18, Батуми — тремя ступенями выше 15-го этажа.
Номер брони: ${payment.internal_order_id}

Если планы изменятся, напишите нам в этот чат — перенесём бронь на другой день.`;

            const res = await notifyGuest(payment.guest_phone, guestText);
            if (!res.sent && res.reason !== "not_a_phone") {
              console.warn("guest notification skipped", res);
            }
          } catch (error) {
            console.error("guest notification failed", error);
          }
        }

        // persist the notify timestamp immediately so a retry won't re-send
        await updatePayment(payment.id, {
          bog_order_id: bogOrderId || payment.bog_order_id,
          green_notified_at: new Date().toISOString(),
          raw_callback: payload
        });
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
