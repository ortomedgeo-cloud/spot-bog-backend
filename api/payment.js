import { createBogOrder, resolveTtlMinutes } from "../lib/bog.js";
import { looksLikePhone } from "../lib/greenapi.js";
import { getSession, createPayment, isTableBookableForSession } from "../lib/db.js";
import {
  firstNonEmpty,
  json,
  makeInternalOrderId,
  parseNumber
} from "../lib/utils.js";

export const config = {
  api: { bodyParser: true }
};

// The site is reachable on both the apex and the www host (BOG has the
// merchant registered as https://www.spot-bar.site), so allow both origins.
const ALLOWED_ORIGINS = new Set([
  "https://spot-bar.site",
  "https://www.spot-bar.site"
]);

function setCors(req, res) {
  const origin = String(req.headers?.origin || "");
  res.setHeader(
    "Access-Control-Allow-Origin",
    ALLOWED_ORIGINS.has(origin) ? origin : "https://spot-bar.site"
  );
  res.setHeader("Vary", "Origin");
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
  setCors(req, res);

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

    const sessionId = firstNonEmpty(body.session_id, body.sessionId);
    const tableNo = firstNonEmpty(body.table_no, body.table);
    const guests = parseNumber(body.guests || body.persons || body.people || 1);
    const customerName = firstNonEmpty(body.customer_name, body.name);
    const customerPhone = firstNonEmpty(body.customer_phone, body.phone);
    const customerInstagram = firstNonEmpty(body.customer_instagram, body.instagram);
    const comment = firstNonEmpty(body.comment, body.Comment, body.message);
    const reserveUrl = firstNonEmpty(
      body.reserve_url,
      body.tilda_page,
      body.page,
      body.page_url,
      body.current_url
    );

    if (!sessionId) {
      return json(res, 400, { error: "Missing session_id" });
    }
    if (!tableNo) {
      return json(res, 400, { error: "Missing table_no" });
    }
    if (!customerName) {
      return json(res, 400, { error: "Missing customer_name" });
    }
    if (!customerPhone) {
      return json(res, 400, { error: "Missing customer_phone" });
    }
    // Телефон должен быть телефоном: раньше сюда попадали инстаграм-ники, и
    // связаться с гостем было нечем — ни позвонить, ни подтвердить бронь.
    if (!looksLikePhone(customerPhone)) {
      return json(res, 400, {
        error: "INVALID_PHONE",
        detail: "Укажите номер телефона с кодом страны. Инстаграм — в отдельное поле."
      });
    }
    if (!Number.isFinite(guests) || guests <= 0) {
      return json(res, 400, { error: "Invalid guests count" });
    }

    if (!(await isTableBookableForSession(sessionId, tableNo, resolveTtlMinutes()))) {
      return json(res, 409, {
        error: "TABLE_CLOSED",
        detail: "Этот столик сейчас нельзя забронировать онлайн. Напишите нам — подберём другой."
      });
    }

    const session = await getSession(sessionId);
    if (!session) {
      return json(res, 404, { error: `Session not found: ${sessionId}` });
    }

    // Deposit = per-seat price * number of guests (same rule as before).
    const totalAmount = Number(session.price) * Number(guests);
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      return json(res, 400, { error: "Invalid total amount" });
    }

    const internalOrderId = makeInternalOrderId("spot");

    const bog = await createBogOrder({
      totalAmount,
      eventCode: session.event_id,
      title: session.title,
      internalOrderId
    });

    if (!bog?.bogOrderId) {
      throw new Error("BOG returned empty order id");
    }
    if (!bog?.redirectUrl) {
      throw new Error("BOG returned empty redirect URL");
    }

    // Store a pending payment. The booking row itself is created in the
    // callback once payment is confirmed (so unpaid attempts don't hold seats).
    await createPayment({
      internal_order_id: internalOrderId,
      bog_order_id: bog.bogOrderId,
      status: "pending",
      session_id: session.id,
      event_title: session.title,
      table_label: String(tableNo).replace(/\s+/g, " ").trim(),
      guests,
      amount: totalAmount,
      guest_name: customerName,
      guest_phone: customerPhone,
      guest_instagram: customerInstagram,
      reserve_url: reserveUrl,
      comment
    });

    return json(res, 200, {
      ok: true,
      redirect_url: bog.redirectUrl,
      payment_url: bog.redirectUrl,
      internal_order_id: internalOrderId,
      bog_order_id: bog.bogOrderId,
      total_amount: totalAmount,
      event_title: session.title,
      deposit_text: session.deposit_text
    });
  } catch (error) {
    console.error("payment.js error", error);
    return json(res, 500, {
      error: "Failed to create payment",
      detail: String(error?.message || error)
    });
  }
}
