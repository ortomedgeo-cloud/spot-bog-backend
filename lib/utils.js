
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

export function nowIso() {
  return new Date().toISOString();
}

export function makeInternalOrderId(prefix = "spot") {
  return `${prefix}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

export function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

export function normalizeHeader(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function parseNumber(value) {
  const normalized = String(value ?? "")
    .replace(/\s/g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}

export function headerIndexMap(headerRow = []) {
  const map = new Map();
  headerRow.forEach((cell, index) => {
    map.set(normalizeHeader(cell), index);
  });
  return map;
}

export function cellByHeader(row, indexMap, headerName) {
  const idx = indexMap.get(normalizeHeader(headerName));
  if (idx === undefined) return "";
  return row[idx] ?? "";
}

export function firstNonEmpty(...values) {
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (normalized) return normalized;
  }
  return "";
}

export function extractReserveInfo(input) {
  const result = {
    raw_url: "",
    eid: "",
    date: "",
    time: ""
  };

  const raw = String(input ?? "").trim();
  if (!raw) return result;
  result.raw_url = raw;

  try {
    const url = new URL(raw);
    result.eid = String(url.searchParams.get("eid") || "").trim();
    result.date = String(url.searchParams.get("date") || "").trim();
    result.time = String(url.searchParams.get("time") || "").trim();
    return result;
  } catch {
    // fall through
  }

  const eidMatch = raw.match(/[?&]eid=([^&#]+)/i);
  const dateMatch = raw.match(/[?&]date=([^&#]+)/i);
  const timeMatch = raw.match(/[?&]time=([^&#]+)/i);

  result.eid = eidMatch ? decodeURIComponent(eidMatch[1]).trim() : "";
  result.date = dateMatch ? decodeURIComponent(dateMatch[1]).trim() : "";
  result.time = timeMatch ? decodeURIComponent(timeMatch[1]).trim() : "";
  return result;
}

export function parseDdMmYyyy(value) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  return {
    day: Number(dd),
    month: Number(mm),
    year: Number(yyyy)
  };
}

export function parseTimeHm(value) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const [, hh, mm] = match;
  return {
    hour: Number(hh),
    minute: Number(mm)
  };
}

export function sanitizeForSheet(value) {
  if (value == null) return "";
  const s = String(value);

  if (/^\s*@/.test(s)) {
    return `'${s}`;
  }

  return s;
}

// Converts a Google Sheets/Excel date serial number (days since 1899-12-30)
// into the "DD-MM-YYYY" format used everywhere else in this codebase
// (URL params, RAW-written sheet rows).
export function excelSerialToDdMmYyyy(serial) {
  const epochMs = Date.UTC(1899, 11, 30);
  const ms = epochMs + Math.round(Number(serial)) * 86400000;
  const d = new Date(ms);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

// Normalizes a value read from a Bookings "Date" cell into "DD-MM-YYYY",
// regardless of whether Sheets is handing it back as:
// - a real date serial number (cell was auto-converted to a Date type,
//   e.g. by someone typing a date directly into the Sheets UI)
// - that same serial number stringified
// - already-correct text (rows written by this backend via RAW always
//   stay as literal "DD-MM-YYYY" text and never get auto-converted)
// Without this, a genuine date cell almost never matches the literal
// "DD-MM-YYYY" string coming from the booking URL, because Sheets'
// FORMATTED_VALUE depends on the column's display format/locale, not on
// what was originally typed.
export function normalizeSheetDate(value) {
  if (value == null || value === "") return "";

  if (typeof value === "number") {
    return excelSerialToDdMmYyyy(value);
  }

  const s = String(value).trim();

  if (/^\d+(\.\d+)?$/.test(s)) {
    return excelSerialToDdMmYyyy(Number(s));
  }

  const m = s.match(/^(\d{1,2})[-.\/](\d{1,2})[-.\/](\d{4})$/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    return `${dd.padStart(2, "0")}-${mm.padStart(2, "0")}-${yyyy}`;
  }

  return s;
}
