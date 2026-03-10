import {
  appendBookingRowIfNotExists,
  findPaymentRowByBogOrderId,
  updatePaymentStatus
} from "../lib/sheets.js";
import { sendWhatsappNotification } from "../lib/greenapi.js";
import { json } from "../lib/utils.js";

export const config = {
  api: { bodyParser: true }
};

function extractBogOrderId(payload) {
  const possible =
    payload?.body?.id ??
    payload?.id ??
    payload?.body?.order_id ??
    payload?.order_id ??
    payload?.body?.external_order_id ??
    payload?.external_order_id;

  return possible ? String(possible).trim() : "";
}

function normalizeStatus(payload) {
  const raw = String(
    payload?.body?.order_status?.key ||
    payload?.body?.status ||
    payload?.status ||
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

function formatWaStatusOk(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `OK ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed" });
  }

  try {
    console.log("BOG RAW CALLBACK", JSON.stringify(req.body, null, 2));
    const payload = req.body || {};
    const bogOrderId = extractBogOrderId(payload);
    const normalizedStatus = normalizeStatus(payload);

    console.log("callback parsed", {
      bogOrderId,
      normalizedStatus,
      rawOrderStatus: payload?.body?.order_status?.key || null
    });

    if (!bogOrderId) {
      console.error("callback missing bog order id", payload);
      return json(res, 200, { ok: true });
    }

    const found = await findPaymentRowByBogOrderId(bogOrderId);
    if (!found) {
      console.error("callback payment row not found", { bogOrderId, payload });
      return json(res, 200, { ok: true });
    }

    const current = found.data;
    const next = {
      ...current,
      bog_order_id: bogOrderId,
      status:
        normalizedStatus === "paid"
          ? "paid"
          : normalizedStatus === "failed"
            ? "failed"
            : current.status,
      raw_callback_status: JSON.stringify(payload)
    };

    let waStatus = "";
    if (normalizedStatus === "paid" && !current.green_notified_at) {
      const text =
`✅ Новая оплаченная бронь\n\nСобытие: ${current.event_title}\nID события: ${current.event_code}\nСтол: ${current.table_no}\nГостей: ${current.guests}\nИмя: ${current.customer_name}\nКонтакт: ${current.customer_phone}\nСумма: ${current.price} GEL\nBOG order: ${bogOrderId}\nBooking ID: ${current.internal_order_id}`;

      await sendWhatsappNotification(text);
      next.green_notified_at = new Date().toISOString();
      waStatus = formatWaStatusOk(new Date());
    }

    await updatePaymentStatus(found.sheetRowNumber, next);

    if (normalizedStatus === "paid") {
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
    }

    return json(res, 200, { ok: true });
  } catch (error) {
    console.error("callback.js error", error);
    return json(res, 200, { ok: true });
  }
}
