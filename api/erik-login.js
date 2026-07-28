import crypto from "crypto";
import { json, createErikToken } from "../lib/utils.js";

// Second password gate for the Erik panel. Independent of the main admin
// login: pass lives in ERIK_PANEL_PASS, session in its own spot_erik cookie.

const TTL_MS = 12 * 60 * 60 * 1000;

function safeBody(body) {
  if (!body) return {};
  if (typeof body === "object") return body;
  try { return JSON.parse(body); } catch { return {}; }
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export default function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  const expected = process.env.ERIK_PANEL_PASS;
  if (!expected) return json(res, 500, { error: "ERIK_PANEL_PASS not configured" });

  const body = safeBody(req.body);
  if (!safeEqual(String(body.pass || ""), expected)) {
    return json(res, 401, { error: "Неверный пароль" });
  }

  let token;
  try {
    token = createErikToken(TTL_MS);
  } catch {
    return json(res, 500, { error: "Token secret not configured" });
  }

  const maxAge = Math.floor(TTL_MS / 1000);
  res.setHeader(
    "Set-Cookie",
    `spot_erik=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`
  );
  return json(res, 200, { ok: true });
}
