
import crypto from "crypto";

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
    .replace(/[^\d.\-]/g, "");
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
