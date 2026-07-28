// Pure conversion core for the Sheets -> Postgres migration (and later the
// ongoing one-way sync). No I/O here: functions take already-read rows and
// return normalized records + a report of anything that couldn't be mapped.
// This module is shared by the one-off migration script and the sync endpoint.

// ---- shared helpers ----

export function normTitle(v) {
  return String(v ?? "")
    .replace(/[«»""„“”"']/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function stripQuotes(v) {
  return String(v ?? "").replace(/[«»""„“”"']/g, "").trim();
}

// Parses eid/date/time out of a reserve link (the only trustworthy source in
// the Ссылки sheet - the human "Дата, время" column often disagrees).
export function parseReserveLink(link) {
  const raw = String(link || "").trim();
  if (!raw || !/reserve\?/.test(raw)) return null;
  const withScheme = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withScheme);
    const eid = (u.searchParams.get("eid") || "").trim();
    const date = (u.searchParams.get("date") || "").trim();
    const time = (u.searchParams.get("time") || "").trim();
    const poster = (u.searchParams.get("poster") || "").trim();
    if (!eid || !date || !time) return null;
    return { eid, date, time, poster };
  } catch {
    return null;
  }
}

// Excel date/time cells arrive as ISO-ish strings after export; normalize to
// the 'DD-MM-YYYY' / 'HH:MM' shapes the rest of the system uses.
export function toDdMmYyyy(value) {
  if (value == null || value === "") return "";
  const s = String(value).trim();
  // already DD-MM-YYYY
  let m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) return `${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}-${m[3]}`;
  // ISO 2026-07-14 or 2026-07-14T00:00:00
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return s;
}

export function toHhMm(value) {
  if (value == null || value === "") return "";
  const s = String(value).trim();
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (m) return `${m[1].padStart(2, "0")}:${m[2]}`;
  return s;
}

// ---- events ----

// eventsRows: array of {eid,Title,Type,Price,DepositText} objects.
// Returns [{ tmp_eid, event }] where event matches the DB createEvent shape.
export function mapEvents(eventsRows) {
  const events = [];
  const byEid = new Map();

  for (const r of eventsRows) {
    const eid = String(r.eid || "").trim();
    if (!eid) continue;
    const ev = {
      legacy_eid: eid,
      tmdb_id: null,
      title: stripQuotes(r.Title),
      poster_url: null,
      format: String(r.Type || "mov").trim() || "mov",
      price: Number(r.Price) || 0,
      deposit_text: r.DepositText ? String(r.DepositText).trim() : null
    };
    events.push(ev);
    byEid.set(eid, ev);
  }

  return { events, byEid };
}

// ---- sessions (from Ссылки) ----

// linksRows: array of { link } (the 3rd column of Ссылки).
// Returns { sessions: [{legacy_eid,date,time,poster}], report }.
export function mapSessions(linksRows) {
  const sessions = [];
  const report = { skipped: [] };

  for (const r of linksRows) {
    const parsed = parseReserveLink(r.link);
    if (!parsed) {
      if (r.link) report.skipped.push({ reason: "unparseable link", link: r.link });
      continue;
    }
    sessions.push({
      legacy_eid: parsed.eid,
      date: parsed.date,
      time: parsed.time,
      poster: parsed.poster || null
    });
  }

  return { sessions, report };
}

// ---- online bookings (from payments, status=paid) ----

// paymentsRows: array of payment objects (the payments sheet columns).
// Returns { bookings, sessionsToEnsure, report }.
export function mapOnlineBookings(paymentsRows) {
  const bookings = [];
  const sessionsToEnsure = []; // sessions that must exist for these bookings
  const report = { skipped: [] };

  for (const p of paymentsRows) {
    const status = String(p.status || "").trim().toLowerCase();
    if (status !== "paid") continue;

    const parsed = parseReserveLink(p.tilda_page);
    const eid = String(p.event_code || parsed?.eid || "").trim();
    const date = parsed?.date || "";
    const time = parsed?.time || "";
    const table = String(p.table_no || "").trim();

    if (!eid || !date || !time || !table) {
      report.skipped.push({
        reason: "missing eid/date/time/table",
        internal_order_id: p.internal_order_id
      });
      continue;
    }

    sessionsToEnsure.push({ legacy_eid: eid, date, time, poster: parsed?.poster || null });

    bookings.push({
      legacy_eid: eid,
      date,
      time,
      id: String(p.internal_order_id || "").trim() || null,
      table_label: table.replace(/\s+/g, " ").trim(),
      guest_name: p.customer_name ? String(p.customer_name).trim() : null,
      guest_phone: p.customer_phone ? String(p.customer_phone).trim() : null,
      guests: p.guests != null ? Number(p.guests) || null : null,
      amount: p.price != null ? Number(p.price) || null : null,
      payment_status: "paid",
      source: "online",
      wa_status: p.green_notified_at ? String(p.green_notified_at) : null
    });
  }

  return { bookings, sessionsToEnsure, report };
}

// ---- manual bookings (from Bookings sheet) ----

// bookingsRows: array of objects with keys Date,Time,Table,Name,Contact,Cap,
//   Price,'Movie/Event','Format Code',Total.
// knownTitles: Set of normalized titles that exist in events (to detect
//   "archived" films). Returns { bookings, report }.
export function mapManualBookings(bookingsRows, knownTitles) {
  const bookings = [];
  const report = { archived: [], skipped: [] };

  for (const b of bookingsRows) {
    const date = toDdMmYyyy(b.Date);
    const time = toHhMm(b.Time);
    const table = String(b.Table || "").replace(/\s+/g, " ").trim();
    const movie = b["Movie/Event"] ? String(b["Movie/Event"]).trim() : "";

    if (!date || !time || !table) {
      report.skipped.push({ reason: "missing date/time/table", movie, date, time });
      continue;
    }

    const normMovie = normTitle(movie);
    const isArchived = !movie || !knownTitles.has(normMovie);

    const rec = {
      match_title: movie, // used to find/create the session's event
      is_archived: isArchived,
      date,
      time,
      table_label: table,
      guest_name: b.Name ? String(b.Name).trim() : null,
      guest_phone: b.Contact ? String(b.Contact).trim() : null,
      guests: b.Cap != null ? Number(b.Cap) || null : null,
      amount: b.Price != null ? Number(b.Price) || null : null,
      payment_status: "paid", // manual rows in the sheet are already-honored bookings
      source: "manual",
      wa_status: null
    };

    if (isArchived) report.archived.push({ movie, date, time, table });
    bookings.push(rec);
  }

  return { bookings, report };
}

// Slug/marker for the catch-all event that archived (no-longer-shown) films
// attach to, so their bookings survive without polluting the live schedule.
export const ARCHIVED_EVENT = {
  legacy_eid: "__archived__",
  title: "Фильм больше не показывается",
  format: "mov",
  price: 0,
  deposit_text: null
};
