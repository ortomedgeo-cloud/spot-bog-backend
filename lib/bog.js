import { randomUUID } from "crypto";

const OAUTH_URL = "https://oauth2.bog.ge/auth/realms/bog/protocol/openid-connect/token";
const CREATE_ORDER_URL = "https://api.bog.ge/payments/v1/ecommerce/orders";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
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

  const body = {
    callback_url: required("BOG_CALLBACK_URL"),
    external_order_id: internalOrderId,
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
