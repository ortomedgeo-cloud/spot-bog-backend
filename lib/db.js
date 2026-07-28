import { neon } from "@neondatabase/serverless";
import crypto from "crypto";

// Single tagged-template query function. Safe against injection: interpolated
// ${values} become $1,$2… placeholders, never string-concatenated.
// DATABASE_URL is the Neon connection string (pooled endpoint is fine for HTTP).
function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Missing env: DATABASE_URL");
  return neon(url);
}

function genId(prefix) {
  return `${prefix}_${crypto.randomBytes(4).toString("hex")}`;
}

// ---------------------------------------------------------------------------
// EVENTS
// ---------------------------------------------------------------------------

export async function createEvent({ tmdb_id, title, poster_url, format, price, deposit_text }) {
  const sql = db();
  const id = genId("ev");
  const rows = await sql`
    INSERT INTO events (id, tmdb_id, title, poster_url, format, price, deposit_text)
    VALUES (${id}, ${tmdb_id || null}, ${title}, ${poster_url || null},
            ${format || "mov"}, ${price}, ${deposit_text || null})
    RETURNING id, tmdb_id, title, poster_url, format, price, deposit_text
  `;
  return rows[0];
}

export async function updateEvent(id, { tmdb_id, title, poster_url, format, price, deposit_text }) {
  const sql = db();
  const rows = await sql`
    UPDATE events SET
      tmdb_id = ${tmdb_id || null},
      title = ${title},
      poster_url = ${poster_url || null},
      format = ${format || "mov"},
      price = ${price},
      deposit_text = ${deposit_text || null}
    WHERE id = ${id}
    RETURNING id, tmdb_id, title, poster_url, format, price, deposit_text
  `;
  return rows[0] || null;
}

export async function listEvents() {
  const sql = db();
  return sql`
    SELECT id, tmdb_id, title, poster_url, format, price, deposit_text
    FROM events ORDER BY title ASC
  `;
}

export async function getEvent(id) {
  const sql = db();
  const rows = await sql`
    SELECT id, tmdb_id, title, poster_url, format, price, deposit_text
    FROM events WHERE id = ${id} LIMIT 1
  `;
  return rows[0] || null;
}

// ---------------------------------------------------------------------------
// SESSIONS
// ---------------------------------------------------------------------------

// Creates a screening for an event. date is 'DD-MM-YYYY' (as used in links) or
// a real Date; we store it as a proper DATE column so there's never any
// locale/format ambiguity again.
export async function createSession({ event_id, date, time, duration = 120 }) {
  const sql = db();
  const iso = ddmmyyyyToIso(date);
  if (!iso) throw new Error(`Invalid date: ${date}`);

  const id = genId("s");
  const rows = await sql`
    INSERT INTO sessions (id, event_id, date, time, duration)
    VALUES (${id}, ${event_id}, ${iso}, ${String(time).trim()}, ${duration})
    RETURNING id, event_id, to_char(date, 'DD-MM-YYYY') AS date, time, duration
  `;
  return rows[0];
}

// Returns every session joined with its event, for the sessions/links list.
export async function listSessions() {
  const sql = db();
  // Ordering: live events first, archived (placeholder event) last. Within
  // live: upcoming sessions first (soonest on top), then past ones (newest
  // first). "Today" is computed in Georgia time (UTC+4).
  return sql`
    SELECT s.id, s.event_id,
           to_char(s.date, 'DD-MM-YYYY') AS date, s.time, s.duration,
           e.title, e.poster_url, e.format, e.price,
           (e.title = 'Фильм больше не показывается') AS is_archived
    FROM sessions s
    JOIN events e ON e.id = s.event_id
    ORDER BY
      (e.title = 'Фильм больше не показывается') ASC,
      (s.date >= (now() + interval '4 hours')::date) DESC,
      CASE WHEN s.date >= (now() + interval '4 hours')::date THEN s.date END ASC,
      CASE WHEN s.date <  (now() + interval '4 hours')::date THEN s.date END DESC,
      s.time ASC
  `;
}

// Updates a session's event binding and/or date/time. Used by the admin to
// re-attach migrated "archived" sessions to their real event once it's been
// created, and to fix typos without recreating the session (bookings keep
// pointing at the same session id).
export async function updateSession(id, { event_id, date, time, duration }) {
  const sql = db();
  const iso = date ? ddmmyyyyToIso(date) : null;
  if (date && !iso) throw new Error(`Invalid date: ${date}`);

  const rows = await sql`
    UPDATE sessions SET
      event_id = COALESCE(${event_id || null}, event_id),
      date = COALESCE(${iso}, date),
      time = COALESCE(${time || null}, time),
      duration = COALESCE(${duration || null}, duration)
    WHERE id = ${id}
    RETURNING id, event_id, to_char(date, 'DD-MM-YYYY') AS date, time, duration
  `;
  return rows[0] || null;
}

export async function getSession(id) {
  const sql = db();
  const rows = await sql`
    SELECT s.id, s.event_id,
           to_char(s.date, 'DD-MM-YYYY') AS date, s.time, s.duration,
           e.title, e.poster_url, e.format, e.price, e.deposit_text
    FROM sessions s
    JOIN events e ON e.id = s.event_id
    WHERE s.id = ${id} LIMIT 1
  `;
  return rows[0] || null;
}

// ---------------------------------------------------------------------------
// AVAILABILITY / BOOKINGS
// ---------------------------------------------------------------------------

// Booked tables for a session — replaces getBookedTablesForSession(eid,date).
// Now keyed by the unique session_id (date is intrinsic to the session).
export async function getBookedTables(session_id) {
  const sql = db();
  const rows = await sql`
    SELECT table_label FROM bookings WHERE session_id = ${session_id}
  `;
  return rows.map((r) => r.table_label).filter(Boolean);
}

// Inserts a booking. The UNIQUE(session_id, table_label) constraint makes this
// atomic against double-booking: a concurrent insert of the same table fails
// at the DB level (23505) instead of silently racing like Sheets did.
export async function createBooking({
  id,
  session_id,
  table_label,
  guest_name,
  guest_phone,
  guests,
  amount,
  payment_status = "unpaid",
  source = "online",
  wa_status
}) {
  const sql = db();
  const bookingId = id || genId("b");
  try {
    const rows = await sql`
      INSERT INTO bookings
        (id, session_id, table_label, guest_name, guest_phone, guests,
         amount, payment_status, source, wa_status)
      VALUES
        (${bookingId}, ${session_id}, ${table_label}, ${guest_name || null},
         ${guest_phone || null}, ${guests || null}, ${amount || null},
         ${payment_status}, ${source}, ${wa_status || null})
      RETURNING id, session_id, table_label
    `;
    return { ok: true, ...rows[0] };
  } catch (error) {
    if (String(error?.code) === "23505") {
      const err = new Error(`Table "${table_label}" already booked for this session`);
      err.code = "TABLE_TAKEN";
      throw err;
    }
    throw error;
  }
}

// Idempotent booking insert used by the paid-callback flow: if a booking with
// this id already exists, do nothing (handles BOG delivering a callback twice).
export async function createBookingIfNotExists(booking) {
  const sql = db();
  const existing = await sql`SELECT id FROM bookings WHERE id = ${booking.id} LIMIT 1`;
  if (existing.length) return { ok: true, existed: true };
  return createBooking(booking);
}

// ---------------------------------------------------------------------------
// PAYMENTS
// ---------------------------------------------------------------------------

export async function createPayment(record) {
  const sql = db();
  const rows = await sql`
    INSERT INTO payments
      (internal_order_id, bog_order_id, status, session_id, event_title,
       table_label, guests, amount, guest_name, guest_phone, reserve_url,
       green_notified_at, raw_callback, comment)
    VALUES
      (${record.internal_order_id}, ${record.bog_order_id || null},
       ${record.status || "pending"}, ${record.session_id || null},
       ${record.event_title || null}, ${record.table_label || null},
       ${record.guests || null}, ${record.amount || null},
       ${record.guest_name || null}, ${record.guest_phone || null},
       ${record.reserve_url || null}, ${record.green_notified_at || null},
       ${record.raw_callback ? JSON.stringify(record.raw_callback) : null},
       ${record.comment || null})
    RETURNING id, internal_order_id
  `;
  return rows[0];
}

export async function findPaymentByBogOrderId(bogOrderId) {
  const sql = db();
  const rows = await sql`
    SELECT * FROM payments WHERE bog_order_id = ${bogOrderId} LIMIT 1
  `;
  return rows[0] || null;
}

export async function findPaymentByInternalOrderId(internalOrderId) {
  const sql = db();
  const rows = await sql`
    SELECT * FROM payments WHERE internal_order_id = ${internalOrderId} LIMIT 1
  `;
  return rows[0] || null;
}

export async function updatePayment(id, fields) {
  const sql = db();
  const rows = await sql`
    UPDATE payments SET
      bog_order_id = COALESCE(${fields.bog_order_id ?? null}, bog_order_id),
      status = COALESCE(${fields.status ?? null}, status),
      green_notified_at = COALESCE(${fields.green_notified_at ?? null}, green_notified_at),
      raw_callback = COALESCE(${fields.raw_callback ? JSON.stringify(fields.raw_callback) : null}, raw_callback)
    WHERE id = ${id}
    RETURNING id
  `;
  return rows[0] || null;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function ddmmyyyyToIso(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  const s = String(value || "").trim();
  const m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  // already ISO?
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

export { genId };

// ---------------------------------------------------------------------------
// ADMIN QUERIES (Stage 4)
// ---------------------------------------------------------------------------

// Sessions happening on a given ISO date (YYYY-MM-DD) with their bookings,
// for the "Сегодня" dashboard. Defaults to today's date in the given TZ
// offset (Georgia is UTC+4).
export async function getSessionsWithBookingsForDate(isoDate) {
  const sql = db();
  const sessions = await sql`
    SELECT s.id, to_char(s.date, 'DD-MM-YYYY') AS date, s.time, s.duration,
           e.title, e.poster_url, e.format, e.price
    FROM sessions s
    JOIN events e ON e.id = s.event_id
    WHERE s.date = ${isoDate}
    ORDER BY s.time ASC
  `;

  if (!sessions.length) return [];

  const ids = sessions.map((s) => s.id);
  const bookings = await sql`
    SELECT id, session_id, table_label, guest_name, guest_phone, guests,
           amount, payment_status, source, created_at
    FROM bookings
    WHERE session_id = ANY(${ids})
    ORDER BY table_label ASC
  `;

  const bySession = new Map();
  bookings.forEach((b) => {
    if (!bySession.has(b.session_id)) bySession.set(b.session_id, []);
    bySession.get(b.session_id).push(b);
  });

  return sessions.map((s) => ({
    ...s,
    bookings: bySession.get(s.id) || []
  }));
}

// Payments from the last N days, newest first, for the Erik panel list.
export async function listPaymentsSince(days = 30) {
  const sql = db();
  return sql`
    SELECT id, internal_order_id, bog_order_id, status, session_id,
           event_title, table_label, guests, amount, guest_name, guest_phone,
           green_notified_at, created_at
    FROM payments
    WHERE created_at >= now() - (${days} || ' days')::interval
    ORDER BY created_at DESC
  `;
}
