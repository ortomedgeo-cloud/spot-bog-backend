import { randomUUID } from "crypto";

const OAUTH_URL = "https://oauth2.bog.ge/auth/realms/bog/protocol/openid-connect/token";
const CREATE_ORDER_URL = "https://api.bog.ge/payments/v1/ecommerce/orders";
const RECEIPT_URL = "https://api.bog.ge/payments/v1/receipt";
const REFUND_URL = "https://api.bog.ge/payments/v1/payment/refund";

// Payment methods BOG accepts in the create-order body. Anything outside this
// list is dropped, so a typo in BOG_PAYMENT_METHODS can't produce a 400 that
// would break every payment.
const KNOWN_PAYMENT_METHODS = new Set([
  "card",
  "google_pay",
  "apple_pay",
  "bog_p2p",
  "bog_loyalty",
  "bnpl",
  "bog_loan",
  "gift_card"
]);

// Per BOG docs: minimum 2 minutes, maximum 1440, defaults to 15 if omitted.
const TTL_MIN = 2;
const TTL_MAX = 1440;
const TTL_DEFAULT = 30;

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function resolveTtlMinutes() {
  const raw = Number(process.env.BOG_ORDER_TTL_MINUTES);
  if (!Number.isFinite(raw)) return TTL_DEFAULT;
  return Math.min(TTL_MAX, Math.max(TTL_MIN, Math.round(raw)));
}

// Empty/unset => don't send the field at all, so the payment page keeps
// offering every method the merchant has enabled (BOG's default behaviour).
// Set BOG_PAYMENT_METHODS=card to temporarily restrict payments to plain
// card while wallet payments are being declined by the acquirer.
function resolvePaymentMethods() {
  const raw = String(process.env.BOG_PAYMENT_METHODS || "").trim();
  if (!raw) return null;

  const list = raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => KNOWN_PAYMENT_METHODS.has(item));

  return list.length ? list : null;
}

export async function getAccessToken() {
  const basic = Buffer.from(
    `${required("BOG_CLIENT_ID")}:${required("BOG_CLIENT_SECRET")}`
  ).toString("base64");

  const resp = await fetch(OAUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`
    },
    body: new URLSearchParams({ grant_type: "client_credentials" })
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.access_token) {
    throw new Error(`Failed to get BOG token: ${JSON.stringify(data)}`);
  }

  return data.access_token;
}

export async function createBogOrder({ totalAmount, eventCode, title, internalOrderId }) {
  const accessToken = await getAccessToken();
  const amount = Number(totalAmount);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Invalid totalAmount: ${totalAmount}`);
  }

  const paymentMethods = resolvePaymentMethods();

  const body = {
    callback_url: required("BOG_CALLBACK_URL"),
    external_order_id: internalOrderId,
    ttl: resolveTtlMinutes(),
    ...(paymentMethods ? { payment_method: paymentMethods } : {}),
    redirect_urls: {
      success: `${required("BOG_SUCCESS_URL")}?order_id=${encodeURIComponent(internalOrderId)}`,
      fail: required("BOG_FAIL_URL")
    },
    purchase_units: {
      currency: process.env.BOG_CURRENCY || "GEL",
      total_amount: amount,
      basket: [
        {
          quantity: 1,
          unit_price: amount,
          product_id: String(eventCode),
          description: String(title || eventCode || "Spot booking")
        }
      ]
    }
  };

  const resp = await fetch(CREATE_ORDER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Accept-Language": process.env.BOG_LANGUAGE || "en",
      "Idempotency-Key": randomUUID()
    },
    body: JSON.stringify(body)
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(`BOG create order failed: ${JSON.stringify(data)}`);
  }

  const redirectUrl = data?._links?.redirect?.href || data?.redirect_url;
  if (!redirectUrl) {
    throw new Error(`BOG redirect URL missing: ${JSON.stringify(data)}`);
  }

  return {
    bogOrderId: data.id,
    redirectUrl,
    status: data.status || data?.order_status?.key || "created"
  };
}

// GET /payments/v1/receipt/:order_id — the same payload BOG posts to our
// callback, but pulled on demand. Used by scripts/audit-orders.js to find out
// *why* past orders failed (payment_detail.code / reject_reason), which the
// callback only stores as an opaque JSON blob in the sheet.
export async function getPaymentDetails(bogOrderId, accessToken) {
  const token = accessToken || (await getAccessToken());
  const id = String(bogOrderId || "").trim();

  if (!id) throw new Error("getPaymentDetails: empty bogOrderId");

  const resp = await fetch(`${RECEIPT_URL}/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` }
  });

  const data = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    throw new Error(
      `BOG receipt failed (${resp.status}): ${JSON.stringify(data)}`
    );
  }

  return data;
}

// POST /payments/v1/payment/refund/:order_id — full refund if `amount` is
// omitted, partial otherwise (card/Apple Pay/Google Pay only; can't exceed
// transfer_amount). Response only acks receipt (key: "request_received") —
// actual completion arrives later via callback or getPaymentDetails, see
// parseRefundState below.
export async function refundBogOrder(bogOrderId, { amount } = {}) {
  const accessToken = await getAccessToken();
  const id = String(bogOrderId || "").trim();
  if (!id) throw new Error("refundBogOrder: empty bogOrderId");

  const body = {};
  if (amount != null) {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      throw new Error(`Invalid refund amount: ${amount}`);
    }
    body.amount = amt;
  }

  const resp = await fetch(`${REFUND_URL}/${encodeURIComponent(id)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Idempotency-Key": randomUUID()
    },
    body: JSON.stringify(body)
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(`BOG refund failed (${resp.status}): ${JSON.stringify(data)}`);
  }

  return {
    key: data.key || "",
    message: data.message || "",
    actionId: data.action_id || ""
  };
}

// Shared by api/callback.js, api/admin-refund.js and api/erik-payment-detail.js.
// Accepts either a callback payload's `.body` or a getPaymentDetails() root object.
export function parseRefundState(bogBody) {
  const b = bogBody || {};
  const key = String(b?.order_status?.key || "").toLowerCase();
  const refundAmount = Number(b?.purchase_units?.refund_amount);
  return {
    statusKey: key,
    refundAmount: Number.isFinite(refundAmount) ? refundAmount : null
  };
}
