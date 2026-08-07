import crypto from "crypto";
import { json, createAdminToken } from "../lib/utils.js";

// Admin login: verifies username+password against ADMIN_USER / ADMIN_PASS
// (stored in Vercel env, never in code), and on success sets an httpOnly,
// Secure, SameSite cookie carrying a short-lived HMAC session token. The
// password is sent once over HTTPS and never stored client-side.

const TTL_MS = 12 * 60 * 60 * 1000; // 12h session

function safeBody(body) {
  if (!body) return {};
  if (typeof body === "object") return body;
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export default function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed" });
  }

  const expectedUser = process.env.ADMIN_USER;
  const expectedPass = process.env.ADMIN_PASS;

  if (!expectedUser || !expectedPass) {
    return json(res, 500, { error: "Admin credentials not configured" });
  }

  const body = safeBody(req.body);
  const user = String(body.user || "");
  const pass = String(body.pass || "");

  // Check both, always compute both comparisons to avoid leaking which failed.
  const okUser = safeEqual(user, expectedUser);
  const okPass = safeEqual(pass, expectedPass);

  if (!okUser || !okPass) {
    return json(res, 401, { error: "Неверный логин или пароль" });
  }

  let token;
  try {
    token = createAdminToken(TTL_MS);
  } catch {
    return json(res, 500, { error: "Token secret not configured" });
  }

  const maxAge = Math.floor(TTL_MS / 1000);
  res.setHeader(
    "Set-Cookie",
    `spot_admin=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`
  );

  return json(res, 200, { ok: true });
}
