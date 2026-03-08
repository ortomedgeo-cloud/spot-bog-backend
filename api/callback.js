import {
  findPaymentRowByBogOrderId,
  updatePaymentStatus,
  appendBookingRowIfNotExists
} from "../lib/sheets.js";
import { sendWhatsappNotification } from "../lib/greenapi.js";

export const config = {
  api: { bodyParser: true }
};

function extractBogOrderId(payload) {
  return String(
    payload?.body?.order_id ||
    payload?.order_id ||
    ""
  ).trim();
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

function parseReserveUrl(urlString) {
  try {
    const url = new URL(urlString);
    return {
      date: url.searchParams.get("date") || "",
      time: url.searchParams.get("time") || "",
      eid: url.searchParams.get("eid") || ""
    };
  } catch {
    return { date: "", time: "", eid: "" };
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
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
      return res.status(200).json({ ok: true });
    }

    const found = await findPaymentRowByBogOrderId(bogOrderId);

    if (!found) {
      console.error("callback payment row not found", { bogOrderId, payload });
      return res.status(200).json({ ok: true });
    }

    const current = found.data;
    const nowIso = new Date().toISOString();

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

    let whatsappSent = false;
    let waStatus = "";

    if (normalizedStatus === "paid" && !current.green_notified_at) {
      const parsed = parseReserveUrl(current.reserve_url || current.tilda_page || "");

      const text =
`✅ Новая оплаченная бронь

Событие: ${current.event_title}
ID события: ${current.event_code}
Тип: ${current.type}
Дата: ${parsed.date}
Время: ${parsed.time}
Стол: ${current.table_no}
Гостей: ${current.guests}
Имя: ${current.customer_name}
Контакт: ${current.customer_phone}
Сумма: ${current.price} GEL
BOG order: ${bogOrderId}
Booking ID: ${current.internal_order_id}`;

      await sendWhatsappNotification(text);
      whatsappSent = true;
      waStatus = formatWaStatusOk(new Date());
      next.green_notified_at = nowIso;
    }

    await updatePaymentStatus(found.sheetRowNumber, next);

    if (normalizedStatus === "paid") {
      const parsed = parseReserveUrl(current.reserve_url || current.tilda_page || "");

      await appendBookingRowIfNotExists({
        booking_id: current.internal_order_id,
        date: parsed.date,
        time: parsed.time,
        table: current.table_no,
        name: current.customer_name,
        phone: current.customer_phone,
        persons: current.guests,
        amount: current.price,
        event: current.event_title,
        wa_status: whatsappSent ? waStatus : "",
        eid: current.event_code || parsed.eid,
        type: current.type,
        price: current.unit_price || current.price,
        deposit_text: current.deposit_text || "",
        payment: true,
        status: "list"
      });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("callback.js error:", err);
    return res.status(200).json({ ok: true });
  }
}