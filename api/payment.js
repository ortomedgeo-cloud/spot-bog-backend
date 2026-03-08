import { createBogOrder } from "../lib/bog.js";
import { appendPayment, getEventByCode } from "../lib/sheets.js";
import {
  extractReserveMetaFromUrl,
  json,
  makeInternalOrderId,
  nowIso,
  parseNumber,
  safeUrl
} from "../lib/utils.js";

export const config = {
  api: { bodyParser: true }
};

function isAuthorized(req) {
  const expected = process.env.INCOMING_FORM_TOKEN;
  if (!expected) return true;
  const got = req.headers["x-form-token"] || req.body?.form_token;
  return String(got || "") === String(expected);
}

function buildAbsoluteUrl(raw, originHint) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";

  const absolute = safeUrl(trimmed);
  if (absolute) return absolute.toString();

  const base = safeUrl(originHint || "");
  if (!base) return "";

  try {
    return new URL(trimmed, base.origin).toString();
  } catch {
    return "";
  }
}

function detectReserveUrl(req, body) {
  const candidates = [
    body.reserve_url,
    body.tilda_page,
    body.page,
    body.page_url,
    body.current_url,
    req.headers.referer,
    req.headers.referrer
  ];

  const originHint = String(req.headers.origin || req.headers.referer || "");

  for (const candidate of candidates) {
    const absolute = buildAbsoluteUrl(candidate, originHint);
    if (!absolute) continue;

    const meta = extractReserveMetaFromUrl(absolute);
    if (meta.eid) {
      return {
        reserveUrl: absolute,
        reserveMeta: meta
      };
    }
  }

  const directEid = String(req.query?.eid || body.eid || body.event_code || "").trim();
  if (directEid) {
    return {
      reserveUrl: "",
      reserveMeta: {
        eid: directEid,
        date: String(req.query?.date || body.date || "").trim(),
        time: String(req.query?.time || body.time || "").trim(),
        poster: String(req.query?.poster || body.poster || "").trim(),
        duration: String(req.query?.duration || body.duration || "").trim()
      }
    };
  }

  return {
    reserveUrl: "",
    reserveMeta: {
      eid: "",
      date: "",
      time: "",
      poster: "",
      duration: ""
    }
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed" });
  }

  if (!isAuthorized(req)) {
    return json(res, 401, { error: "Unauthorized form token" });
  }

  try {
    const body = req.body || {};
    const { reserveUrl, reserveMeta } = detectReserveUrl(req, body);

    const eventCode = reserveMeta.eid;
    const tableNo = String(body.table_no || body.table || "").trim();
    const guests = parseNumber(body.guests || body.persons || body.people || 1);
    const customerName = String(body.customer_name || body.name || "").trim();
    const customerPhone = String(body.customer_phone || body.phone || "").trim();
    const tildaPage = reserveUrl || String(body.tilda_page || body.page || body.page_url || "").trim();

    if (!eventCode) {
      return json(res, 400, {
        error: "Missing eid in reserve URL or request payload"
      });
    }
    if (!tableNo) return json(res, 400, { error: "Missing table_no" });
    if (!customerName) return json(res, 400, { error: "Missing customer_name" });
    if (!Number.isFinite(guests) || guests <= 0) {
      return json(res, 400, { error: "Invalid guests count" });
    }

    const event = await getEventByCode(eventCode);
    if (!event) {
      return json(res, 404, { error: `Event not found: ${eventCode}` });
    }

    const totalAmount = event.unit_price * guests;
    const internalOrderId = makeInternalOrderId("spot");

    const bog = await createBogOrder({
      totalAmount,
      eventCode: event.event_code,
      guests,
      unitPrice: event.unit_price,
      internalOrderId
    });

    await appendPayment({
      created_at: nowIso(),
      internal_order_id: internalOrderId,
      bog_order_id: bog.bogOrderId,
      status: "pending",
      event_code: event.event_code,
      event_title: event.title,
      type: event.type,
      price: totalAmount,
      table_no: tableNo,
      guests,
      customer_name: customerName,
      customer_phone: customerPhone,
      tilda_page: tildaPage,
      green_notified_at: "",
      raw_callback_status: bog.status
    });

    return json(res, 200, {
      ok: true,
      payment_url: bog.redirectUrl,
      internal_order_id: internalOrderId,
      bog_order_id: bog.bogOrderId,
      total_amount: totalAmount,
      event_title: event.title,
      deposit_text: event.deposit_text,
      reserve_meta: reserveMeta
    });
  } catch (error) {
    console.error("payment.js error", error);
    return json(res, 500, {
      error: "Failed to create payment",
      detail: String(error.message || error)
    });
  }
}
