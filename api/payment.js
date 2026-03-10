import { createBogOrder } from "../lib/bog.js";
import { appendPayment, getEventByCode } from "../lib/sheets.js";
import {
  extractReserveInfo,
  firstNonEmpty,
  json,
  makeInternalOrderId,
  nowIso,
  parseNumber
} from "../lib/utils.js";

export const config = {
  api: { bodyParser: true }
};

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "https://spot-bar.site");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Form-Token");
}

function safeBody(body) {
  if (!body) return {};
  if (typeof body === "object") return body;

  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

function isAuthorized(req, body) {
  const expected = process.env.INCOMING_FORM_TOKEN;
  if (!expected) return true;

  const got = req.headers["x-form-token"] || body?.form_token;
  return String(got || "") === String(expected);
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed" });
  }

  const body = safeBody(req.body);

  if (!isAuthorized(req, body)) {
    return json(res, 401, { error: "Unauthorized form token" });
  }

  try {
    console.log("payment request body", body);

    const reserveUrl = firstNonEmpty(
      body.reserve_url,
      body.tilda_page,
      body.page,
      body.page_url,
      body.current_url
    );

    const reserveInfo = extractReserveInfo(reserveUrl);

    const eventCode = firstNonEmpty(
      body.event_code,
      body.eid,
      reserveInfo.eid
    );

    const tableNo = firstNonEmpty(
      body.table_no,
      body.table
    );

    const guests = parseNumber(
      body.guests || body.persons || body.people || 1
    );

    const customerName = firstNonEmpty(
      body.customer_name,
      body.name
    );

    const customerPhone = firstNonEmpty(
      body.customer_phone,
      body.phone
    );

    const customerInstagram = firstNonEmpty(
      body.customer_instagram,
      body.instagram,
      body.insta
    );

    const comment = firstNonEmpty(
      body.comment,
      body.Comment,
      body.message
    );

    if (!eventCode) {
      return json(res, 400, { error: "Missing event_code / eid" });
    }

    if (!tableNo) {
      return json(res, 400, { error: "Missing table_no" });
    }

    if (!customerName) {
      return json(res, 400, { error: "Missing customer_name" });
    }

    if (!customerPhone && !customerInstagram) {
      return json(res, 400, { error: "Missing contact info" });
    }

    if (!Number.isFinite(guests) || guests <= 0) {
      return json(res, 400, { error: "Invalid guests count" });
    }

    const event = await getEventByCode(eventCode);

    if (!event) {
      return json(res, 404, { error: `Event not found: ${eventCode}` });
    }

    const totalAmount = Number(event.unit_price) * Number(guests);

    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      return json(res, 400, { error: "Invalid total amount" });
    }

    const internalOrderId = makeInternalOrderId("spot");

    const bog = await createBogOrder({
      totalAmount,
      eventCode: event.event_code,
      title: event.title,
      internalOrderId
    });

    if (!bog?.bogOrderId) {
      throw new Error("BOG returned empty order id");
    }

    if (!bog?.redirectUrl) {
      throw new Error("BOG returned empty redirect URL");
    }

    const combinedContact = [customerPhone, customerInstagram]
      .filter(Boolean)
      .join(" / ");

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
      customer_phone: combinedContact,
      tilda_page: reserveUrl,
      green_notified_at: "",
      raw_callback_status: "",
      comment
    });

    return json(res, 200, {
      ok: true,
      redirect_url: bog.redirectUrl,
      payment_url: bog.redirectUrl,
      internal_order_id: internalOrderId,
      bog_order_id: bog.bogOrderId,
      total_amount: totalAmount,
      event_title: event.title,
      deposit_text: event.deposit_text
    });
  } catch (error) {
    console.error("payment.js error", error);

    return json(res, 500, {
      error: "Failed to create payment",
      detail: String(error?.message || error)
    });
  }
}