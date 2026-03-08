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

export function safeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

export function extractEidFromUrl(urlValue) {
  const url = safeUrl(urlValue);
  if (!url) return "";
  return String(url.searchParams.get("eid") || "").trim();
}

export function extractReserveMetaFromUrl(urlValue) {
  const url = safeUrl(urlValue);
  if (!url) {
    return {
      eid: "",
      date: "",
      time: "",
      poster: "",
      duration: ""
    };
  }

  return {
    eid: String(url.searchParams.get("eid") || "").trim(),
    date: String(url.searchParams.get("date") || "").trim(),
    time: String(url.searchParams.get("time") || "").trim(),
    poster: String(url.searchParams.get("poster") || "").trim(),
    duration: String(url.searchParams.get("duration") || "").trim()
  };
}
