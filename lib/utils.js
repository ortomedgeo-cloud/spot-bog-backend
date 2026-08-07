
import crypto from "crypto";

// ---- Admin session tokens (HMAC-signed, self-contained, no DB) ----
// A token is "<expiryMs>.<hmac>" where hmac = HMAC-SHA256(secret, expiryMs).
// It proves the server issued it (can't be forged without the secret) and
// carries its own expiry. Used to auth admin actions after a password login,
// so the password itself is never stored client-side or resent per request.

function adminSecret() {
  // Reuse an existing strong secret; fall back to a dedicated one if set.
  return (
    process.env.ADMIN_TOKEN_SECRET ||
    process.env.MANUAL_BOOKING_SECRET ||
    ""
  );
}

export function createAdminToken(ttlMs = 12 * 60 * 60 * 1000) {
  const secret = adminSecret();
  if (!secret) throw new Error("No admin token secret configured");
  const exp = Date.now() + ttlMs;
  const sig = crypto.createHmac("sha256", secret).update(String(exp)).digest("hex");
  return `${exp}.${sig}`;
}

export function verifyAdminToken(token) {
  const secret = adminSecret();
  if (!secret) return false;
  const raw = String(token || "");
  const dot = raw.indexOf(".");
  if (dot === -1) return false;

  const exp = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!/^\d+$/.test(exp)) return false;
  if (Number(exp) < Date.now()) return false;

  const expected = crypto.createHmac("sha256", secret).update(exp).digest("hex");
  // constant-time compare
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Reads the admin token from the Cookie header (spot_admin=...).
export function getAdminTokenFromCookie(req) {
  const raw = String(req.headers?.cookie || "");
  const m = raw.match(/(?:^|;\s*)spot_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

// Verifies an admin request: valid session cookie OR (legacy) correct ?key=.
export function isAdminAuthed(req) {
  if (verifyAdminToken(getAdminTokenFromCookie(req))) return true;
  // legacy fallback: ?key= or X-Manual-Key equal to MANUAL_BOOKING_SECRET
  const expected = process.env.MANUAL_BOOKING_SECRET;
  if (expected) {
    const provided =
      String(req.query?.key || "") ||
      String(req.headers?.["x-manual-key"] || "");
    if (provided && provided === expected) return true;
  }
  return false;
}

export function makeInternalOrderId(prefix = "spot") {
  return `${prefix}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

export function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

export function parseNumber(value) {
  const normalized = String(value ?? "")
    .replace(/\s/g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}

export function firstNonEmpty(...values) {
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (normalized) return normalized;
  }
  return "";
}

// ---- Erik panel: second, separate auth layer (Stage 4) ----
// Same HMAC-token mechanics as the admin session, but salted differently and
// stored in its own cookie (spot_erik), so the regular admin login does NOT
// open this panel. Gate password lives in ERIK_PANEL_PASS.

function erikSecret() {
  const base =
    process.env.ADMIN_TOKEN_SECRET ||
    process.env.MANUAL_BOOKING_SECRET ||
    "";
  return base ? `erik:${base}` : "";
}

export function createErikToken(ttlMs = 12 * 60 * 60 * 1000) {
  const secret = erikSecret();
  if (!secret) throw new Error("No erik token secret configured");
  const exp = Date.now() + ttlMs;
  const sig = crypto.createHmac("sha256", secret).update(String(exp)).digest("hex");
  return `${exp}.${sig}`;
}

export function verifyErikToken(token) {
  const secret = erikSecret();
  if (!secret) return false;
  const raw = String(token || "");
  const dot = raw.indexOf(".");
  if (dot === -1) return false;
  const exp = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!/^\d+$/.test(exp)) return false;
  if (Number(exp) < Date.now()) return false;
  const expected = crypto.createHmac("sha256", secret).update(exp).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function isErikAuthed(req) {
  const raw = String(req.headers?.cookie || "");
  const m = raw.match(/(?:^|;\s*)spot_erik=([^;]+)/);
  return m ? verifyErikToken(decodeURIComponent(m[1])) : false;
}
