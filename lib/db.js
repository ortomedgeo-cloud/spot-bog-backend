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

  // Снимок названия в сеансах обновляем только у будущих: прошедшие — история,
  // и переименование события не должно задним числом переписывать архив.
  if (rows[0]) {
    await sql`
      UPDATE sessions SET
        event_title  = ${title},
        event_format = ${format || "mov"},
        event_price  = ${price}
      WHERE event_id = ${id}
        AND deleted_at IS NULL
        AND date >= (now() + interval '4 hours')::date
    `;
  }

  return rows[0] || null;
}

// Мягкое удаление: событие исчезает из списков, но сеансы и брони остаются
// в архиве вместе со своим названием. См. db/archive-everything.sql.
export async function softDeleteEvent(id) {
  const sql = db();
  const rows = await sql`
    UPDATE events SET deleted_at = now()
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING id, title
  `;
  return rows[0] || null;
}

export async function listEvents() {
  const sql = db();
  return sql`
    SELECT id, tmdb_id, title, poster_url, format, price, deposit_text
    FROM events WHERE deleted_at IS NULL ORDER BY title ASC
  `;
}

// ---------------------------------------------------------------------------
// EVENT FORMATS
// ---------------------------------------------------------------------------

export async function listFormats() {
  const sql = db();
  return sql`
    SELECT code, title, price_kind, deposit_text, sort_order
    FROM event_formats ORDER BY sort_order ASC, title ASC
  `;
}

export async function createFormat({ code, title, price_kind, deposit_text, sort_order }) {
  const sql = db();
  const rows = await sql`
    INSERT INTO event_formats (code, title, price_kind, deposit_text, sort_order)
    VALUES (${code}, ${title}, ${price_kind || "deposit"}, ${deposit_text || null}, ${sort_order || 0})
    RETURNING code, title, price_kind, deposit_text, sort_order
  `;
  return rows[0];
}

export async function updateFormat(code, { title, price_kind, deposit_text, sort_order }) {
  const sql = db();
  const rows = await sql`
    UPDATE event_formats SET
      title = ${title},
      price_kind = ${price_kind || "deposit"},
      deposit_text = ${deposit_text || null},
      sort_order = ${sort_order || 0}
    WHERE code = ${code}
    RETURNING code, title, price_kind, deposit_text, sort_order
  `;
  return rows[0] || null;
}

export async function deleteFormat(code) {
  const sql = db();
  const rows = await sql`
    DELETE FROM event_formats WHERE code = ${code} RETURNING code
  `;
  return rows.length;
}

// ---------------------------------------------------------------------------
// SESSIONS
// ---------------------------------------------------------------------------

// Creates a screening for an event. date is 'DD-MM-YYYY' (as used in links) or
// a real Date; we store it as a proper DATE column so there's never any
// locale/format ambiguity again.
export async function createSession({ event_id, date, time, duration = 120, poster_url }) {
  const sql = db();
  const iso = ddmmyyyyToIso(date);
  if (!iso) throw new Error(`Invalid date: ${date}`);

  const id = genId("s");

  // Название/формат/цена события копируются в сеанс сразу: дальше архив
  // читает снимок и переживает и переименование, и удаление события.
  const [ev] = await sql`
    SELECT title, format, price FROM events WHERE id = ${event_id}
  `;

  const rows = await sql`
    INSERT INTO sessions (id, event_id, date, time, duration, poster_url,
                          event_title, event_format, event_price)
    VALUES (${id}, ${event_id}, ${iso}, ${String(time).trim()}, ${duration}, ${poster_url || null},
            ${ev?.title || null}, ${ev?.format || null}, ${ev?.price ?? null})
    RETURNING id, event_id, to_char(date, 'DD-MM-YYYY') AS date, time, duration, poster_url
  `;
  return rows[0];
}

// Returns upcoming sessions joined with their event, for the sessions/links
// list. Past sessions drop off this list on their own (no manual cleanup) —
// they still live in the DB and show up in the booking archive, which reads
// straight from `sessions`/`bookings` and isn't affected by this filter.
// "Today" is computed in Georgia time (UTC+4).
export async function listSessions() {
  const sql = db();
  return sql`
    SELECT s.id, s.event_id,
           to_char(s.date, 'DD-MM-YYYY') AS date, s.time, s.duration,
           COALESCE(e.title, NULLIF(s.event_title, 'Фильм больше не показывается'), 'Название не сохранено') AS title,
           COALESCE(s.poster_url, e.poster_url) AS poster_url,
           s.poster_url AS own_poster_url,
           COALESCE(e.format, s.event_format) AS format,
           COALESCE(e.price, s.event_price) AS price,
           (e.id IS NULL) AS is_archived
    FROM sessions s
    LEFT JOIN events e ON e.id = s.event_id AND e.deleted_at IS NULL
    WHERE s.date >= (now() + interval '4 hours')::date
      AND s.deleted_at IS NULL
    ORDER BY
      (e.id IS NULL) ASC,
      s.date ASC,
      s.time ASC
  `;
}

// Updates a session's event binding and/or date/time. Used by the admin to
// re-attach migrated "archived" sessions to their real event once it's been
// created, and to fix typos without recreating the session (bookings keep
// pointing at the same session id).
export async function updateSession(id, { event_id, date, time, duration, poster_url }) {
  const sql = db();
  const iso = date ? ddmmyyyyToIso(date) : null;
  if (date && !iso) throw new Error(`Invalid date: ${date}`);

  const rows = await sql`
    UPDATE sessions SET
      event_id = COALESCE(${event_id || null}, event_id),
      date = COALESCE(${iso}, date),
      time = COALESCE(${time || null}, time),
      duration = COALESCE(${duration || null}, duration),
      poster_url = CASE WHEN ${poster_url === undefined} THEN poster_url
                        ELSE ${poster_url || null} END
    WHERE id = ${id}
    RETURNING id, event_id, to_char(date, 'DD-MM-YYYY') AS date, time, duration
  `;

  // Сеанс перевесили на другое событие — снимок названия должен поехать за ним,
  // иначе в архиве останется старое имя.
  if (rows[0] && event_id) {
    await sql`
      UPDATE sessions s SET
        event_title  = e.title,
        event_format = e.format,
        event_price  = e.price
      FROM events e
      WHERE e.id = s.event_id AND s.id = ${id}
    `;
  }

  // Дата/время сеанса тоже лежат снимком в бронях — держим их в согласии.
  if (rows[0] && (iso || time)) {
    await sql`
      UPDATE bookings b SET session_date = s.date, session_time = s.time
      FROM sessions s WHERE s.id = b.session_id AND s.id = ${id}
    `;
  }

  return rows[0] || null;
}

// Вписать название сеанса руками. Нужно для старых записей, где событие
// удалили ещё прежним кодом и настоящее название взять неоткуда: в архиве
// лучше пустое поле, которое можно заполнить, чем выдумка про то, что фильм
// «больше не показывается». Пишем и в брони — снимок должен совпадать.
export async function setSessionTitle(id, title) {
  const sql = db();
  const clean = String(title || "").trim();
  if (!clean) return null;

  const rows = await sql`
    UPDATE sessions SET event_title = ${clean}
    WHERE id = ${id}
    RETURNING id, event_title
  `;
  if (!rows[0]) return null;

  await sql`
    UPDATE bookings SET event_title = ${clean} WHERE session_id = ${id}
  `;
  await logBooking({
    entity: "session", entity_id: id, action: "update", actor: "admin",
    session_id: id, event_title: clean, details: { archive_title: clean }
  });
  return rows[0];
}

// Мягкое удаление сеанса: пропадает из расписания, но остаётся в архиве
// вместе со всеми бронями.
export async function softDeleteSession(id) {
  const sql = db();
  const rows = await sql`
    UPDATE sessions SET deleted_at = now()
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING id
  `;
  return rows[0] || null;
}

export async function getSession(id) {
  const sql = db();
  const rows = await sql`
    SELECT s.id, s.event_id,
           to_char(s.date, 'DD-MM-YYYY') AS date, s.time, s.duration,
           COALESCE(e.title, NULLIF(s.event_title, 'Фильм больше не показывается'), 'Название не сохранено') AS title,
           COALESCE(s.poster_url, e.poster_url) AS poster_url,
           s.poster_url AS own_poster_url,
           COALESCE(e.format, s.event_format) AS format,
           COALESCE(e.price, s.event_price) AS price,
           e.deposit_text
    FROM sessions s
    LEFT JOIN events e ON e.id = s.event_id AND e.deleted_at IS NULL
    WHERE s.id = ${id} AND s.deleted_at IS NULL LIMIT 1
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
    SELECT table_label FROM bookings
    WHERE session_id = ${session_id} AND deleted_at IS NULL
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
  guest_instagram,
  guests,
  amount,
  payment_status = "unpaid",
  source = "online",
  wa_status,
  comment
}) {
  const sql = db();
  const bookingId = id || genId("b");

  // Снимок сеанса кладём в саму бронь: архив должен читаться, даже если сеанс
  // и событие потом удалят.
  const [snap] = await sql`
    SELECT COALESCE(s.event_title, e.title) AS event_title, s.date, s.time
    FROM sessions s
    LEFT JOIN events e ON e.id = s.event_id
    WHERE s.id = ${session_id}
  `;

  try {
    const rows = await sql`
      INSERT INTO bookings
        (id, session_id, table_label, guest_name, guest_phone, guest_instagram, guests,
         amount, payment_status, source, wa_status, comment,
         event_title, session_date, session_time)
      VALUES
        (${bookingId}, ${session_id}, ${table_label}, ${guest_name || null},
         ${guest_phone || null}, ${guest_instagram || null}, ${guests || null}, ${amount || null},
         ${payment_status}, ${source}, ${wa_status || null}, ${comment || null},
         ${snap?.event_title || null}, ${snap?.date || null}, ${snap?.time || null})
      RETURNING id, session_id, table_label
    `;
    await logBooking({
      entity: "booking", entity_id: bookingId, action: "create",
      actor: source === "manual" ? "admin" : "online",
      session_id, event_title: snap?.event_title, table_label, guest_name,
      details: { guests, amount, payment_status, guest_phone, guest_instagram }
    });
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
// ЖУРНАЛ ИЗМЕНЕНИЙ
// ---------------------------------------------------------------------------
// Пишется только вперёд. Ошибка записи в журнал не должна валить саму
// операцию — гость важнее лога, поэтому здесь try/catch, а не throw.

export async function logBooking({
  entity, entity_id, action, actor,
  session_id, event_title, table_label, guest_name, details
}) {
  try {
    const sql = db();
    await sql`
      INSERT INTO booking_log
        (entity, entity_id, action, actor, session_id, event_title,
         table_label, guest_name, details)
      VALUES
        (${entity}, ${String(entity_id)}, ${action}, ${actor || null},
         ${session_id || null}, ${event_title || null}, ${table_label || null},
         ${guest_name || null}, ${details ? JSON.stringify(details) : null})
    `;
  } catch (error) {
    console.error("booking_log write failed", error);
  }
}

// Журнал по одному сеансу или по одной брони — «что тут вообще происходило».
export async function listBookingLog({ session_id, entity_id, limit = 200 } = {}) {
  const sql = db();
  const n = Math.min(500, Math.max(1, Number(limit) || 200));
  if (entity_id) {
    return sql`
      SELECT id, at, entity, entity_id, action, actor, session_id,
             event_title, table_label, guest_name, details
      FROM booking_log WHERE entity_id = ${entity_id}
      ORDER BY at DESC LIMIT ${n}
    `;
  }
  if (session_id) {
    return sql`
      SELECT id, at, entity, entity_id, action, actor, session_id,
             event_title, table_label, guest_name, details
      FROM booking_log WHERE session_id = ${session_id}
      ORDER BY at DESC LIMIT ${n}
    `;
  }
  return sql`
    SELECT id, at, entity, entity_id, action, actor, session_id,
           event_title, table_label, guest_name, details
    FROM booking_log ORDER BY at DESC LIMIT ${n}
  `;
}

// ---------------------------------------------------------------------------
// PAYMENTS
// ---------------------------------------------------------------------------

export async function createPayment(record) {
  const sql = db();
  const rows = await sql`
    INSERT INTO payments
      (internal_order_id, bog_order_id, status, session_id, event_title,
       table_label, guests, amount, guest_name, guest_phone, guest_instagram, reserve_url,
       green_notified_at, raw_callback, comment)
    VALUES
      (${record.internal_order_id}, ${record.bog_order_id || null},
       ${record.status || "pending"}, ${record.session_id || null},
       ${record.event_title || null}, ${record.table_label || null},
       ${record.guests || null}, ${record.amount || null},
       ${record.guest_name || null}, ${record.guest_phone || null}, ${record.guest_instagram || null},
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
      raw_callback = COALESCE(${fields.raw_callback ? JSON.stringify(fields.raw_callback) : null}, raw_callback),
      refund_status = COALESCE(${fields.refund_status ?? null}, refund_status),
      refund_requested_amount = COALESCE(${fields.refund_requested_amount ?? null}, refund_requested_amount),
      refunded_amount = COALESCE(${fields.refunded_amount ?? null}, refunded_amount),
      refund_action_id = COALESCE(${fields.refund_action_id ?? null}, refund_action_id),
      refund_requested_at = COALESCE(${fields.refund_requested_at ?? null}, refund_requested_at),
      refunded_at = COALESCE(${fields.refunded_at ?? null}, refunded_at)
    WHERE id = ${id}
    RETURNING *
  `;
  return rows[0] || null;
}

// Advances payments.refund_status monotonically (never regresses on a
// stale/duplicate callback or reconcile pull), and — only on a *full*
// refund confirmation — flips the linked booking's payment_status to
// 'refunded'. Booking id === payment.internal_order_id (see schema comment
// on bookings.id). Returns the updated payment row, or null if nothing changed.
const REFUND_RANK = { requested: 1, partially_refunded: 2, refunded: 3 };

export async function syncRefundState(payment, { statusKey, refundAmount, rawCallback } = {}) {
  const key = String(statusKey || "");
  const mapped =
    key.includes("refunded_partially") ? "partially_refunded" :
    key.includes("refunded")           ? "refunded" :
    key.includes("refund")             ? "requested" :
    null;
  if (!mapped) return null;

  const currentRank = REFUND_RANK[payment.refund_status] || 0;
  if (REFUND_RANK[mapped] < currentRank) return null; // stale/out-of-order, ignore

  const updated = await updatePayment(payment.id, {
    refund_status: mapped,
    refunded_amount: refundAmount,
    refunded_at: mapped === "refunded" ? (payment.refunded_at || new Date().toISOString()) : null,
    raw_callback: rawCallback ?? undefined
  });

  if (mapped === "refunded") {
    try {
      await updateBooking(payment.internal_order_id, { payment_status: "refunded" });
    } catch (error) {
      console.error("syncRefundState: booking update failed", error);
    }
  }

  return updated;
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
           COALESCE(e.title, NULLIF(s.event_title, 'Фильм больше не показывается'), 'Название не сохранено') AS title,
           COALESCE(s.poster_url, e.poster_url) AS poster_url,
           COALESCE(e.format, s.event_format) AS format,
           COALESCE(e.price, s.event_price) AS price
    FROM sessions s
    LEFT JOIN events e ON e.id = s.event_id AND e.deleted_at IS NULL
    WHERE s.date = ${isoDate} AND s.deleted_at IS NULL
    ORDER BY s.time ASC
  `;

  if (!sessions.length) return [];

  const ids = sessions.map((s) => s.id);
  const bookings = await sql`
    SELECT id, session_id, table_label, guest_name, guest_phone, guests,
           amount, payment_status, source, created_at
    FROM bookings
    WHERE session_id = ANY(${ids}) AND deleted_at IS NULL
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
// Joins in the session's screening date/time (the date people were paying
// *for*, not just when they paid) and whether a booking actually exists for
// this payment — a paid-but-no-booking row means the table was lost to a
// race and needs a manual reseat/refund.
export async function listPaymentsSince(days = 30) {
  const sql = db();
  return sql`
    SELECT p.id, p.internal_order_id, p.bog_order_id, p.status, p.session_id,
           p.event_title, p.table_label, p.guests, p.amount, p.guest_name, p.guest_phone,
           p.green_notified_at, p.created_at,
           p.refund_status, p.refund_requested_amount, p.refunded_amount,
           p.refund_requested_at, p.refunded_at,
           to_char(s.date, 'DD-MM-YYYY') AS session_date, s.time AS session_time,
           (b.id IS NOT NULL) AS has_booking
    FROM payments p
    LEFT JOIN sessions s ON s.id = p.session_id
    LEFT JOIN bookings b ON b.id = p.internal_order_id
    WHERE p.created_at >= now() - (${days} || ' days')::interval
    ORDER BY p.created_at DESC
  `;
}

// ---------------------------------------------------------------------------
// BATCH OPERATIONS (admin)
// ---------------------------------------------------------------------------
// Ничего не удаляется физически. Удаление из админки — это deleted_at:
// запись уходит из рабочих списков и остаётся в архиве целиком, вместе с
// названием, датой и бронями. Прежняя схема (CASCADE + подстановка
// «Фильм больше не показывается») стирала ровно то, ради чего архив нужен.

export async function deleteSessionsByIds(ids) {
  const sql = db();
  const rows = await sql`
    UPDATE sessions SET deleted_at = now()
    WHERE id = ANY(${ids}) AND deleted_at IS NULL
    RETURNING id, event_title
  `;
  for (const r of rows) {
    await logBooking({
      entity: "session", entity_id: r.id, action: "delete", actor: "admin",
      session_id: r.id, event_title: r.event_title
    });
  }
  return rows.length;
}

export async function deleteEventsByIds(ids) {
  const sql = db();

  const rows = await sql`
    UPDATE events SET deleted_at = now()
    WHERE id = ANY(${ids}) AND deleted_at IS NULL
    RETURNING id, title
  `;

  // Будущие сеансы удалённого события снимаем с расписания — показывать их
  // на сайте нельзя. Прошедшие остаются как были: это уже история.
  const gone = await sql`
    UPDATE sessions SET deleted_at = now()
    WHERE event_id = ANY(${ids})
      AND deleted_at IS NULL
      AND date >= (now() + interval '4 hours')::date
    RETURNING id, event_title
  `;

  for (const r of rows) {
    await logBooking({
      entity: "event", entity_id: r.id, action: "delete", actor: "admin",
      event_title: r.title, details: { sessions_unscheduled: gone.length }
    });
  }
  return rows.length;
}

// Вернуть удалённое. Архив — не мусорка: если удалили по ошибке, восстановление
// должно быть одной кнопкой, а не запросом в SQL-редакторе.
export async function restoreSessionsByIds(ids) {
  const sql = db();
  const rows = await sql`
    UPDATE sessions SET deleted_at = NULL
    WHERE id = ANY(${ids}) AND deleted_at IS NOT NULL
    RETURNING id, event_title
  `;
  for (const r of rows) {
    await logBooking({
      entity: "session", entity_id: r.id, action: "restore", actor: "admin",
      session_id: r.id, event_title: r.event_title
    });
  }
  return rows.length;
}

// Re-attach many sessions to another event in one go (bulk version of the
// single-session reassign; the archived-cleanup workhorse).
export async function reassignSessionsEvent(ids, eventId) {
  const sql = db();
  const rows = await sql`
    UPDATE sessions SET event_id = ${eventId}
    WHERE id = ANY(${ids}) RETURNING id
  `;
  return rows.length;
}

// Bulk-set price and/or format on many events.
export async function bulkUpdateEvents(ids, { price, format }) {
  const sql = db();
  const priceVal = Number.isFinite(Number(price)) && price !== "" && price != null ? Number(price) : null;
  const formatVal = format ? String(format) : null;
  const rows = await sql`
    UPDATE events SET
      price = COALESCE(${priceVal}, price),
      format = COALESCE(${formatVal}, format)
    WHERE id = ANY(${ids}) RETURNING id
  `;
  return rows.length;
}

// Upcoming non-archived sessions for the public reserve-page picker.
export async function listUpcomingSessions() {
  const sql = db();
  return sql`
    SELECT s.id AS session_id, e.id AS event_id,
           to_char(s.date, 'DD-MM-YYYY') AS date, s.time,
           e.title, e.price, COALESCE(s.poster_url, e.poster_url) AS poster_url, e.format,
           ef.title AS format_title
    FROM sessions s
    JOIN events e ON e.id = s.event_id
    LEFT JOIN event_formats ef ON ef.code = e.format
    WHERE e.deleted_at IS NULL
      AND s.deleted_at IS NULL
      AND s.date >= (now() + interval '4 hours')::date
    ORDER BY s.date ASC, s.time ASC
  `;
}

// ---------------------------------------------------------------------------
// MENU
// ---------------------------------------------------------------------------

function menuId(prefix) {
  return `${prefix}_${crypto.randomBytes(4).toString("hex")}`;
}

// Public menu: visible categories with their available items, localized.
// Falls back to the Russian text when a translation is missing, so a
// half-translated menu still renders in full.
export async function getPublicMenu(lang = "ru", menuKey = "main") {
  const sql = db();
  const l = ["ru", "ka", "en"].includes(lang) ? lang : "ru";

  const cats = await sql`
    SELECT id, sort, in_overview, title_ru, title_ka, title_en
    FROM menu_categories
    WHERE visible = true AND menu_key = ${menuKey}
    ORDER BY sort ASC, created_at ASC
  `;
  if (!cats.length) return [];

  const catIds = cats.map((c) => c.id);

  const subs = await sql`
    SELECT id, category_id, sort, in_overview, title_ru, title_ka, title_en
    FROM menu_subcategories
    WHERE category_id = ANY(${catIds})
    ORDER BY sort ASC, created_at ASC
  `;

  // Позиция может стоять в нескольких категориях: своя (category_id) плюс
  // дополнительные размещения. UNION даёт единый список, где цена и порядок
  // берутся от конкретного размещения.
  const items = await sql`
    SELECT id, category_id, subcategory_id, sort, in_overview, title_ru, title_ka, title_en,
           desc_ru, desc_ka, desc_en, price, photo_url, photo_hover_url
    FROM menu_items
    WHERE available = true AND category_id = ANY(${catIds})

    UNION ALL

    SELECT i.id, p.category_id, p.subcategory_id, p.sort, p.in_overview,
           i.title_ru, i.title_ka, i.title_en,
           i.desc_ru, i.desc_ka, i.desc_en,
           COALESCE(p.price, i.price) AS price,
           i.photo_url, i.photo_hover_url
    FROM menu_item_placements p
    JOIN menu_items i ON i.id = p.item_id
    WHERE i.available = true AND p.category_id = ANY(${catIds})

    ORDER BY sort ASC
  `;

  const pick = (row, field) => row[`${field}_${l}`] || row[`${field}_ru`] || "";

  const byCat = new Map();
  items.forEach((it) => {
    if (!byCat.has(it.category_id)) byCat.set(it.category_id, []);
    byCat.get(it.category_id).push({
      id: it.id,
      subcategory_id: it.subcategory_id || null,
      in_overview: it.in_overview !== false,
      title: pick(it, "title"),
      description: pick(it, "desc"),
      price: Number(it.price),
      photo_url: it.photo_url || "",
      photo_hover_url: it.photo_hover_url || ""
    });
  });

  const subsByCat = new Map();
  subs.forEach((sc) => {
    if (!subsByCat.has(sc.category_id)) subsByCat.set(sc.category_id, []);
    subsByCat.get(sc.category_id).push({
      id: sc.id,
      title: pick(sc, "title"),
      in_overview: sc.in_overview !== false
    });
  });

  return cats.map((c) => {
    const list = byCat.get(c.id) || [];
    // Отдаём только те подкатегории, в которых реально есть доступные позиции:
    // пустой фильтр на сайте бесполезен.
    const used = new Set(list.map((i) => i.subcategory_id).filter(Boolean));
    return {
      id: c.id,
      title: pick(c, "title"),
      in_overview: c.in_overview !== false,
      // Фильтры показываем только для непустых подкатегорий, но флаг
      // in_overview отдаём у всех — он нужен странице для общего списка.
      subcategories: (subsByCat.get(c.id) || []).map((sc) => ({
        ...sc,
        has_items: used.has(sc.id)
      })),
      items: list
    };
  });
}

// Full menu for the admin panel: everything, all languages, all flags.
export async function getAdminMenu() {
  const sql = db();
  const categories = await sql`
    SELECT * FROM menu_categories ORDER BY sort ASC, created_at ASC
  `;
  const items = await sql`
    SELECT * FROM menu_items ORDER BY sort ASC, created_at ASC
  `;
  const subcategories = await sql`
    SELECT * FROM menu_subcategories ORDER BY sort ASC, created_at ASC
  `;
  const placements = await sql`
    SELECT * FROM menu_item_placements ORDER BY sort ASC
  `;
  return { categories, subcategories, items, placements };
}

export async function createMenuCategory({ title_ru, title_ka, title_en, sort, menu_key }) {
  const sql = db();
  const rows = await sql`
    INSERT INTO menu_categories (id, sort, title_ru, title_ka, title_en, menu_key)
    VALUES (${menuId("mc")}, ${Number(sort) || 0}, ${title_ru},
            ${title_ka || null}, ${title_en || null}, ${menu_key || 'main'})
    RETURNING *
  `;
  return rows[0];
}

export async function updateMenuCategory(id, f) {
  const sql = db();
  const rows = await sql`
    UPDATE menu_categories SET
      sort     = COALESCE(${f.sort == null ? null : Number(f.sort)}, sort),
      title_ru = COALESCE(${f.title_ru || null}, title_ru),
      title_ka = COALESCE(${f.title_ka ?? null}, title_ka),
      title_en = COALESCE(${f.title_en ?? null}, title_en),
      visible  = COALESCE(${typeof f.visible === "boolean" ? f.visible : null}, visible),
      in_overview = COALESCE(${typeof f.in_overview === "boolean" ? f.in_overview : null}, in_overview),
      menu_key = COALESCE(${f.menu_key || null}, menu_key)
    WHERE id = ${id}
    RETURNING *
  `;
  return rows[0] || null;
}

export async function createMenuItem(f) {
  const sql = db();
  const rows = await sql`
    INSERT INTO menu_items
      (id, category_id, subcategory_id, sort, title_ru, title_ka, title_en,
       desc_ru, desc_ka, desc_en, price, photo_url, photo_hover_url)
    VALUES
      (${menuId("mi")}, ${f.category_id}, ${f.subcategory_id || null},
       ${Number(f.sort) || 0}, ${f.title_ru},
       ${f.title_ka || null}, ${f.title_en || null}, ${f.desc_ru || null},
       ${f.desc_ka || null}, ${f.desc_en || null}, ${Number(f.price) || 0},
       ${f.photo_url || null}, ${f.photo_hover_url || null})
    RETURNING *
  `;
  return rows[0];
}

export async function updateMenuItem(id, f) {
  const sql = db();
  const rows = await sql`
    UPDATE menu_items SET
      category_id = COALESCE(${f.category_id || null}, category_id),
      sort        = COALESCE(${f.sort == null ? null : Number(f.sort)}, sort),
      title_ru    = COALESCE(${f.title_ru || null}, title_ru),
      title_ka    = COALESCE(${f.title_ka ?? null}, title_ka),
      title_en    = COALESCE(${f.title_en ?? null}, title_en),
      desc_ru     = COALESCE(${f.desc_ru ?? null}, desc_ru),
      desc_ka     = COALESCE(${f.desc_ka ?? null}, desc_ka),
      desc_en     = COALESCE(${f.desc_en ?? null}, desc_en),
      price       = COALESCE(${f.price == null ? null : Number(f.price)}, price),
      photo_url   = COALESCE(${f.photo_url ?? null}, photo_url),
      photo_hover_url = COALESCE(${f.photo_hover_url ?? null}, photo_hover_url),
      subcategory_id  = CASE WHEN ${f.subcategory_id === undefined}
                             THEN subcategory_id
                             ELSE ${f.subcategory_id || null} END,
      available   = COALESCE(${typeof f.available === "boolean" ? f.available : null}, available),
      in_overview = COALESCE(${typeof f.in_overview === "boolean" ? f.in_overview : null}, in_overview)
    WHERE id = ${id}
    RETURNING *
  `;
  return rows[0] || null;
}

// Batch helpers. Deleting a category cascades to its items.
export async function deleteMenuCategories(ids) {
  const sql = db();
  const rows = await sql`DELETE FROM menu_categories WHERE id = ANY(${ids}) RETURNING id`;
  return rows.length;
}

export async function deleteMenuItems(ids) {
  const sql = db();
  const rows = await sql`DELETE FROM menu_items WHERE id = ANY(${ids}) RETURNING id`;
  return rows.length;
}

export async function setMenuItemsAvailability(ids, available) {
  const sql = db();
  const rows = await sql`
    UPDATE menu_items SET available = ${!!available}
    WHERE id = ANY(${ids}) RETURNING id
  `;
  return rows.length;
}

// ---------------------------------------------------------------------------
// ОБСЛУЖИВАНИЕ ЗА СТОЛОМ
// ---------------------------------------------------------------------------

// Метки мест — тот же справочник, что в бронях. Публичные эндпоинты сверяют
// пришедший из QR стол с этим списком, чтобы в базу не попадал мусор.
export const SEAT_LABELS = [
  "Стол 1", "Стол 2", "Стол 3", "Стол 4", "Стол 5", "Стол 6",
  "Стол 7", "Стол 8", "Стол 9", "Стол 10",
  "Бар 1", "Бар 2", "Бар 3", "Бар 4"
];

export const SERVICE_KINDS = ["waiter", "bill", "blanket", "charger", "ashtray"];

// Номер столика гость вписывает руками (номер написан на кубике), поэтому
// приходит он в любом виде: «5», «стол 5», «Бар 2», «bar2», «стол №7».
// Приводим к канонической метке справочника или возвращаем null.
export function normalizeSeat(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return null;

  const num = Number((s.match(/\d+/) || [])[0]);
  if (!Number.isFinite(num) || num <= 0) return null;

  const isBar = /бар|bar|ბარი/.test(s);
  const label = isBar ? `Бар ${num}` : `Стол ${num}`;
  return SEAT_LABELS.includes(label) ? label : null;
}

function svcId(prefix) {
  return `${prefix}_${crypto.randomBytes(4).toString("hex")}`;
}

// Троттлинг: не чаще одной такой же просьбы с этого стола за N секунд.
// Защищает персонал от случайного (или намеренного) спама кнопкой.
export async function recentServiceRequest(table_label, kind, seconds = 20) {
  const sql = db();
  const rows = await sql`
    SELECT id FROM service_requests
    WHERE table_label = ${table_label} AND kind = ${kind}
      AND created_at > now() - (${seconds} || ' seconds')::interval
    LIMIT 1
  `;
  return rows[0] || null;
}

export async function createServiceRequest({ table_label, kind, comment, lang }) {
  const sql = db();
  const rows = await sql`
    INSERT INTO service_requests (id, table_label, kind, comment, lang)
    VALUES (${svcId("sr")}, ${table_label}, ${kind}, ${comment || null}, ${lang || null})
    RETURNING *
  `;
  return rows[0];
}

// Создаёт заказ вместе со строками. Цены НЕ берутся от клиента — только из
// menu_items, иначе сумму можно было бы подделать из браузера.
export async function createOrder({ table_label, guest_name, comment, mode, lang, lines }) {
  const sql = db();

  const ids = lines.map((l) => l.menu_item_id);
  const found = await sql`
    SELECT id, title_ru, title_ka, title_en, price
    FROM menu_items
    WHERE id = ANY(${ids}) AND available = true
  `;
  const byId = new Map(found.map((f) => [f.id, f]));

  const priced = [];
  for (const l of lines) {
    const m = byId.get(l.menu_item_id);
    if (!m) continue; // позиция исчезла или снята с продажи
    const qty = Math.max(1, Math.min(50, Number(l.qty) || 1));
    const title =
      (lang === "ka" && m.title_ka) ||
      (lang === "en" && m.title_en) ||
      m.title_ru;
    priced.push({ menu_item_id: m.id, title, price: Number(m.price), qty });
  }

  if (!priced.length) {
    const err = new Error("Нет доступных позиций в заказе");
    err.code = "EMPTY_ORDER";
    throw err;
  }

  const total = priced.reduce((s, l) => s + l.price * l.qty, 0);
  const orderId = svcId("o");

  await sql`
    INSERT INTO orders (id, table_label, guest_name, comment, mode, lang, total)
    VALUES (${orderId}, ${table_label}, ${guest_name || null}, ${comment || null},
            ${mode === "takeaway" ? "takeaway" : "in_venue"}, ${lang || null}, ${total})
  `;

  for (const l of priced) {
    await sql`
      INSERT INTO order_items (id, order_id, menu_item_id, title, price, qty)
      VALUES (${svcId("oi")}, ${orderId}, ${l.menu_item_id}, ${l.title}, ${l.price}, ${l.qty})
    `;
  }

  return { id: orderId, table_label, total, lines: priced };
}

export async function listServiceRequests(hours = 24) {
  const sql = db();
  return sql`
    SELECT * FROM service_requests
    WHERE created_at > now() - (${hours} || ' hours')::interval
    ORDER BY created_at DESC
  `;
}

export async function setOrderStatus(id, status) {
  const sql = db();
  const rows = await sql`
    UPDATE orders SET status = ${status} WHERE id = ${id} RETURNING *
  `;
  return rows[0] || null;
}

export async function setServiceRequestStatus(id, status) {
  const sql = db();
  const rows = await sql`
    UPDATE service_requests SET status = ${status} WHERE id = ${id} RETURNING *
  `;
  return rows[0] || null;
}

// ---------------------------------------------------------------------------
// НАСТРОЙКИ УВЕДОМЛЕНИЙ
// ---------------------------------------------------------------------------

export async function getNotifySettings() {
  const sql = db();
  return sql`SELECT channel, enabled FROM notify_settings`;
}

export async function setNotifyChannel(channel, enabled) {
  const sql = db();
  const rows = await sql`
    INSERT INTO notify_settings (channel, enabled, updated_at)
    VALUES (${channel}, ${enabled}, now())
    ON CONFLICT (channel) DO UPDATE SET enabled = ${enabled}, updated_at = now()
    RETURNING channel, enabled
  `;
  return rows[0];
}

// Значения хранятся уже зашифрованными (lib/secrets.js) — здесь чистое
// хранилище строк, шифрование не его забота.
export async function getNotifySecrets() {
  const sql = db();
  return sql`SELECT channel, name, value FROM notify_secrets`;
}

export async function setNotifySecret(channel, name, encryptedValue) {
  const sql = db();
  await sql`
    INSERT INTO notify_secrets (channel, name, value, updated_at)
    VALUES (${channel}, ${name}, ${encryptedValue}, now())
    ON CONFLICT (channel, name) DO UPDATE SET value = ${encryptedValue}, updated_at = now()
  `;
}

export async function deleteNotifySecret(channel, name) {
  const sql = db();
  await sql`DELETE FROM notify_secrets WHERE channel = ${channel} AND name = ${name}`;
}

// Массовое перестроение меню: новый порядок категорий и позиций плюс
// перенос позиций между категориями — одной операцией.
// Используется визуальным конструктором в админке: он присылает состояние
// целиком, а не по одному изменению, поэтому порядок никогда не «рассыпается».
export async function reorderMenu({ categories = [], subcategories = [], items = [] }) {
  const sql = db();

  for (const c of categories) {
    if (!c?.id) continue;
    await sql`UPDATE menu_categories SET sort = ${Number(c.sort) || 0} WHERE id = ${c.id}`;
  }

  for (const sc of subcategories) {
    if (!sc?.id) continue;
    await sql`UPDATE menu_subcategories SET sort = ${Number(sc.sort) || 0} WHERE id = ${sc.id}`;
  }

  for (const i of items) {
    if (!i?.id) continue;
    // subcategory_id пишем всегда: перенос «в никакую подкатегорию» — это
    // осмысленное действие, и COALESCE его бы проглотил.
    await sql`
      UPDATE menu_items
      SET sort = ${Number(i.sort) || 0},
          category_id = COALESCE(${i.category_id || null}, category_id),
          subcategory_id = ${i.subcategory_id || null}
      WHERE id = ${i.id}
    `;
  }

  return {
    categories: categories.length,
    subcategories: subcategories.length,
    items: items.length
  };
}

// ---- подкатегории ----

export async function createMenuSubcategory({ category_id, title_ru, title_ka, title_en, sort }) {
  const sql = db();
  const rows = await sql`
    INSERT INTO menu_subcategories (id, category_id, sort, title_ru, title_ka, title_en)
    VALUES (${menuId("ms")}, ${category_id}, ${Number(sort) || 0}, ${title_ru},
            ${title_ka || null}, ${title_en || null})
    RETURNING *
  `;
  return rows[0];
}

export async function updateMenuSubcategory(id, f) {
  const sql = db();
  const rows = await sql`
    UPDATE menu_subcategories SET
      sort     = COALESCE(${f.sort == null ? null : Number(f.sort)}, sort),
      title_ru = COALESCE(${f.title_ru || null}, title_ru),
      title_ka = COALESCE(${f.title_ka ?? null}, title_ka),
      title_en = COALESCE(${f.title_en ?? null}, title_en),
      in_overview = COALESCE(${typeof f.in_overview === "boolean" ? f.in_overview : null}, in_overview)
    WHERE id = ${id}
    RETURNING *
  `;
  return rows[0] || null;
}

export async function deleteMenuSubcategories(ids) {
  const sql = db();
  const rows = await sql`DELETE FROM menu_subcategories WHERE id = ANY(${ids}) RETURNING id`;
  return rows.length;
}

// ---------------------------------------------------------------------------
// ПЛАН ЗАЛА
// ---------------------------------------------------------------------------
// Метка стола («Стол 5») — это ключ, по которому бронь занимает место.
// План задаёт только геометрию для меток; переименование стола не переписывает
// прошлые брони, поэтому админка об этом предупреждает.

export async function getFloorPlan() {
  const sql = db();
  const [settings] = await sql`SELECT * FROM floor_settings WHERE id = 1`;
  const tables = await sql`
    SELECT * FROM floor_tables ORDER BY sort ASC, label ASC
  `;
  return {
    settings: settings || { canvas_w: 1000, canvas_h: 700, grid: 20, screen_label: "SCREEN" },
    tables
  };
}

// Публичная версия: только активные столы и ничего лишнего.
// eventId необязателен — если передан, вместимость столов подменяется
// значениями из event_table_overrides там, где для события есть своя запись.
export async function getPublicFloorPlan(eventId, sessionId) {
  const sql = db();

  // Кастомная рассадка перебивает общий план целиком: если для этого сеанса
  // или события зал расставлен иначе, показывать общий план нельзя — гость
  // выберет стол, которого сегодня физически нет там, где нарисовано.
  const custom = await resolveCustomFloorPlan({ eventId, sessionId });
  if (custom) {
    return {
      settings: {
        canvas_w: custom.plan.canvas_w,
        canvas_h: custom.plan.canvas_h,
        screen_label: custom.plan.screen_label
      },
      tables: custom.tables.filter((t) => t.active !== false),
      custom: custom.scope
    };
  }

  const [settings] = await sql`SELECT canvas_w, canvas_h, screen_label FROM floor_settings WHERE id = 1`;
  const tables = eventId
    ? await sql`
        SELECT ft.label, ft.zone, ft.shape, ft.x, ft.y, ft.w, ft.h, ft.rotation,
               COALESCE(o.capacity_min, ft.capacity_min) AS capacity_min,
               COALESCE(o.capacity_max, ft.capacity_max) AS capacity_max,
               ft.bookable
        FROM floor_tables ft
        LEFT JOIN event_table_overrides o ON o.table_label = ft.label AND o.event_id = ${eventId}
        WHERE ft.active = true ORDER BY ft.sort ASC, ft.label ASC
      `
    : await sql`
        SELECT label, zone, shape, x, y, w, h, rotation, capacity_min, capacity_max, bookable
        FROM floor_tables WHERE active = true ORDER BY sort ASC, label ASC
      `;
  return {
    settings: settings || { canvas_w: 1000, canvas_h: 700, screen_label: "SCREEN" },
    tables
  };
}

// ---------------------------------------------------------------------------
// КАСТОМНАЯ РАССАДКА (план под событие или под один сеанс)
// ---------------------------------------------------------------------------
// Разрешение: план сеанса → план события → общий план зала. Метки столов те же,
// что в общем плане: метка связывает бронь с местом, и своя метка на своём
// плане означала бы, что архив перестанет понимать, где сидел гость.

async function loadCustomPlan(where) {
  const sql = db();
  const [plan] = where.session_id
    ? await sql`SELECT * FROM custom_floor_plans WHERE session_id = ${where.session_id}`
    : await sql`SELECT * FROM custom_floor_plans WHERE event_id = ${where.event_id}`;
  if (!plan) return null;
  const tables = await sql`
    SELECT label, zone, shape, x, y, w, h, rotation,
           capacity_min, capacity_max, sort, active, bookable
    FROM custom_floor_tables WHERE plan_id = ${plan.id}
    ORDER BY sort ASC, label ASC
  `;
  return { plan, tables, scope: plan.session_id ? "session" : "event" };
}

export async function resolveCustomFloorPlan({ eventId, sessionId } = {}) {
  let sid = sessionId || null;
  let eid = eventId || null;

  // Знаем только сеанс — событие достаём сами: план мог быть задан на событие.
  if (sid && !eid) {
    const sql = db();
    const [row] = await sql`SELECT event_id FROM sessions WHERE id = ${sid}`;
    eid = row?.event_id || null;
  }

  if (sid) {
    const own = await loadCustomPlan({ session_id: sid });
    if (own) return own;
  }
  if (eid) {
    const ev = await loadCustomPlan({ event_id: eid });
    if (ev) return ev;
  }
  return null;
}

// План для редактора: если своего ещё нет — отдаём копию общего как заготовку,
// чтобы редактор открылся с текущей расстановкой, а не с пустым холстом.
export async function getCustomFloorPlan({ eventId, sessionId } = {}) {
  const own = eventId
    ? await loadCustomPlan({ event_id: eventId })
    : await loadCustomPlan({ session_id: sessionId });

  if (own) {
    return {
      custom: true,
      scope: own.scope,
      note: own.plan.note || "",
      settings: {
        canvas_w: own.plan.canvas_w,
        canvas_h: own.plan.canvas_h,
        screen_label: own.plan.screen_label
      },
      tables: own.tables
    };
  }

  const base = await getFloorPlan();
  return { custom: false, scope: eventId ? "event" : "session", note: "", ...base };
}

export async function saveCustomFloorPlan({ eventId, sessionId, settings, tables, note }) {
  const sql = db();
  const existing = eventId
    ? await loadCustomPlan({ event_id: eventId })
    : await loadCustomPlan({ session_id: sessionId });

  const base = await sql`SELECT canvas_w, canvas_h, screen_label FROM floor_settings WHERE id = 1`;
  const def = base[0] || { canvas_w: 1000, canvas_h: 700, screen_label: "SCREEN" };
  const s = settings || {};
  const planId = existing?.plan.id || genId("cfp");

  if (existing) {
    await sql`
      UPDATE custom_floor_plans SET
        canvas_w     = ${Number(s.canvas_w) || def.canvas_w},
        canvas_h     = ${Number(s.canvas_h) || def.canvas_h},
        screen_label = ${s.screen_label || def.screen_label},
        note         = ${note ?? existing.plan.note ?? null},
        updated_at   = now()
      WHERE id = ${planId}
    `;
    await sql`DELETE FROM custom_floor_tables WHERE plan_id = ${planId}`;
  } else {
    await sql`
      INSERT INTO custom_floor_plans
        (id, event_id, session_id, canvas_w, canvas_h, screen_label, note)
      VALUES
        (${planId}, ${eventId || null}, ${sessionId || null},
         ${Number(s.canvas_w) || def.canvas_w}, ${Number(s.canvas_h) || def.canvas_h},
         ${s.screen_label || def.screen_label}, ${note || null})
    `;
  }

  for (const [i, t] of (tables || []).entries()) {
    const label = String(t?.label || "").trim();
    if (!label) continue;
    await sql`
      INSERT INTO custom_floor_tables
        (plan_id, label, zone, shape, x, y, w, h, rotation,
         capacity_min, capacity_max, sort, active, bookable)
      VALUES
        (${planId}, ${label}, ${t.zone || "hall"}, ${t.shape || "rect"},
         ${Number(t.x) || 0}, ${Number(t.y) || 0},
         ${Number(t.w) || 90}, ${Number(t.h) || 90}, ${Number(t.rotation) || 0},
         ${Number(t.capacity_min) || 1}, ${Number(t.capacity_max) || 4},
         ${Number.isFinite(Number(t.sort)) ? Number(t.sort) : (i + 1) * 10},
         ${t.active !== false}, ${t.bookable !== false})
      ON CONFLICT (plan_id, label) DO UPDATE SET
        zone = EXCLUDED.zone, shape = EXCLUDED.shape,
        x = EXCLUDED.x, y = EXCLUDED.y, w = EXCLUDED.w, h = EXCLUDED.h,
        rotation = EXCLUDED.rotation,
        capacity_min = EXCLUDED.capacity_min, capacity_max = EXCLUDED.capacity_max,
        sort = EXCLUDED.sort, active = EXCLUDED.active, bookable = EXCLUDED.bookable
    `;
  }

  await logBooking({
    entity: eventId ? "event" : "session",
    entity_id: eventId || sessionId,
    action: existing ? "update" : "create",
    actor: "admin",
    session_id: sessionId || null,
    details: { custom_floor_plan: true, tables: (tables || []).length }
  });

  return getCustomFloorPlan({ eventId, sessionId });
}

// Сброс: возвращаемся к общему плану зала.
export async function clearCustomFloorPlan({ eventId, sessionId } = {}) {
  const sql = db();
  const rows = eventId
    ? await sql`DELETE FROM custom_floor_plans WHERE event_id = ${eventId} RETURNING id`
    : await sql`DELETE FROM custom_floor_plans WHERE session_id = ${sessionId} RETURNING id`;
  return rows.length > 0;
}

// Своя вместимость столов под конкретное событие (все сеансы события).
export async function getEventTableOverrides(eventId) {
  const sql = db();
  return sql`
    SELECT table_label, capacity_min, capacity_max
    FROM event_table_overrides WHERE event_id = ${eventId}
  `;
}

// Полная замена набора переопределений для события — проще, чем сравнивать
// со старыми значениями построчно, а строк на событие немного (по числу столов).
export async function setEventTableOverrides(eventId, overrides) {
  const sql = db();
  await sql`DELETE FROM event_table_overrides WHERE event_id = ${eventId}`;
  for (const o of overrides) {
    await sql`
      INSERT INTO event_table_overrides (event_id, table_label, capacity_min, capacity_max)
      VALUES (${eventId}, ${o.table_label}, ${o.capacity_min}, ${o.capacity_max})
    `;
  }
  return getEventTableOverrides(eventId);
}

export async function saveFloorSettings({ canvas_w, canvas_h, grid, screen_label }) {
  const sql = db();
  const rows = await sql`
    UPDATE floor_settings SET
      canvas_w     = COALESCE(${canvas_w == null ? null : Number(canvas_w)}, canvas_w),
      canvas_h     = COALESCE(${canvas_h == null ? null : Number(canvas_h)}, canvas_h),
      grid         = COALESCE(${grid == null ? null : Number(grid)}, grid),
      screen_label = COALESCE(${screen_label ?? null}, screen_label),
      updated_at   = now()
    WHERE id = 1
    RETURNING *
  `;
  return rows[0];
}

// Сохраняет расстановку целиком: редактор присылает состояние плана,
// а не по одному изменению — так порядок и координаты не расходятся.
export async function saveFloorTables(tables) {
  const sql = db();
  for (const t of tables) {
    if (!t?.label) continue;
    await sql`
      INSERT INTO floor_tables
        (label, zone, shape, x, y, w, h, rotation, capacity_min, capacity_max, sort, active, bookable)
      VALUES
        (${t.label}, ${t.zone || "hall"}, ${t.shape || "rect"},
         ${Number(t.x) || 0}, ${Number(t.y) || 0},
         ${Number(t.w) || 90}, ${Number(t.h) || 90}, ${Number(t.rotation) || 0},
         ${Number(t.capacity_min) || 1}, ${Number(t.capacity_max) || 4},
         ${Number(t.sort) || 0}, ${t.active !== false}, ${t.bookable !== false})
      ON CONFLICT (label) DO UPDATE SET
        zone = EXCLUDED.zone, shape = EXCLUDED.shape,
        x = EXCLUDED.x, y = EXCLUDED.y, w = EXCLUDED.w, h = EXCLUDED.h,
        rotation = EXCLUDED.rotation,
        capacity_min = EXCLUDED.capacity_min, capacity_max = EXCLUDED.capacity_max,
        sort = EXCLUDED.sort, active = EXCLUDED.active, bookable = EXCLUDED.bookable
    `;
  }
  return tables.length;
}

// Удаление стола из плана. Брони с этой меткой остаются в базе — они история,
// и терять их из-за перестановки мебели нельзя. Возвращаем, сколько броней
// ссылается на метку, чтобы админка могла предупредить.
export async function deleteFloorTable(label) {
  const sql = db();
  const [{ count }] = await sql`
    SELECT count(*)::int AS count FROM bookings
    WHERE table_label = ${label} AND deleted_at IS NULL
  `;
  await sql`DELETE FROM floor_tables WHERE label = ${label}`;
  return { deleted: true, bookings: count };
}

// Метки, на которые уже есть брони — их переименование или удаление
// осмысленно только с предупреждением.
export async function floorLabelsInUse() {
  const sql = db();
  const rows = await sql`
    SELECT table_label, count(*)::int AS n FROM bookings
    WHERE deleted_at IS NULL GROUP BY table_label
  `;
  return Object.fromEntries(rows.map((r) => [r.table_label, r.n]));
}

// Закрыт ли стол для брони с сайта. Проверяется на сервере: клиентская
// блокировка обходится парой кликов в консоли, а стол может быть закрыт
// под ремонт или служебные нужды.
export async function isTableBookable(label) {
  const sql = db();
  const rows = await sql`
    SELECT bookable FROM floor_tables WHERE label = ${label} AND active = true
  `;
  // Стола нет в плане — не мешаем: план могли ещё не нарисовать.
  if (!rows.length) return true;
  return rows[0].bookable !== false;
}

// ---------------------------------------------------------------------------
// БРОНИ: ПРОСМОТР, ПРАВКА, АРХИВ
// ---------------------------------------------------------------------------

// Полная картина по одному сеансу: событие, план зала и все брони.
// Это рабочее окно администратора — здесь видно, кто где сидит и как с ним
// связаться, поэтому отдаём контакты целиком, а не усечённо.
export async function getSessionDetail(sessionId) {
  const sql = db();

  // Удалённый сеанс тоже открывается: из архива по нему нужно видеть брони,
  // а название берётся из снимка, даже если событие давно удалили.
  const [session] = await sql`
    SELECT s.id, s.event_id, to_char(s.date, 'DD-MM-YYYY') AS date,
           to_char(s.date, 'YYYY-MM-DD') AS iso, s.time, s.duration,
           COALESCE(e.title, NULLIF(s.event_title, 'Фильм больше не показывается'), 'Название не сохранено') AS title,
           COALESCE(e.format, s.event_format) AS format,
           COALESCE(e.price, s.event_price) AS price,
           e.deposit_text,
           COALESCE(s.poster_url, e.poster_url) AS poster_url,
           s.deleted_at,
           (s.deleted_at IS NOT NULL) AS is_deleted,
           (e.id IS NULL) AS event_gone
    FROM sessions s
    LEFT JOIN events e ON e.id = s.event_id AND e.deleted_at IS NULL
    WHERE s.id = ${sessionId}
  `;
  if (!session) return null;

  const all = await sql`
    SELECT id, table_label, guest_name, guest_phone, guest_instagram,
           guests, amount, payment_status, source, wa_status, comment,
           created_at, deleted_at, deleted_reason
    FROM bookings WHERE session_id = ${sessionId}
    ORDER BY table_label ASC
  `;
  const bookings = all.filter((b) => !b.deleted_at);
  const cancelled = all.filter((b) => b.deleted_at);

  // Схема зала — та, что реально действует на этом сеансе (кастомная, если она
  // задана): иначе администратор рассаживает гостей по несуществующей расстановке.
  const custom = await resolveCustomFloorPlan({ sessionId });
  const tables = custom
    ? custom.tables.filter((t) => t.active !== false)
    : await sql`
        SELECT label, zone, shape, x, y, w, h, rotation,
               capacity_min, capacity_max, bookable
        FROM floor_tables WHERE active = true ORDER BY sort ASC, label ASC
      `;

  const blocks = await sql`
    SELECT table_label, reason FROM session_table_blocks WHERE session_id = ${sessionId}
  `;

  const [settings] = await sql`
    SELECT canvas_w, canvas_h, screen_label FROM floor_settings WHERE id = 1
  `;
  const planSettings = custom
    ? {
        canvas_w: custom.plan.canvas_w,
        canvas_h: custom.plan.canvas_h,
        screen_label: custom.plan.screen_label
      }
    : settings || { canvas_w: 1000, canvas_h: 700, screen_label: "SCREEN" };

  const guests = bookings.reduce((n, b) => n + (Number(b.guests) || 0), 0);
  const revenue = bookings.reduce((n, b) => n + (Number(b.amount) || 0), 0);

  return {
    session,
    bookings,
    cancelled,
    blocks,
    plan: { settings: planSettings, tables, custom: custom ? custom.scope : null },
    totals: {
      bookings: bookings.length, guests, revenue,
      cancelled: cancelled.length,
      free: Math.max(0, tables.length - bookings.length - blocks.length)
    }
  };
}

// Правка брони. Пересадка за другой стол проходит через ту же уникальность
// (session_id, table_label), что и обычная бронь, — занять чужое место нельзя.
export async function updateBooking(id, f) {
  const sql = db();
  try {
    const rows = await sql`
      UPDATE bookings SET
        table_label     = COALESCE(${f.table_label || null}, table_label),
        guest_name      = COALESCE(${f.guest_name ?? null}, guest_name),
        guest_phone     = COALESCE(${f.guest_phone ?? null}, guest_phone),
        guest_instagram = COALESCE(${f.guest_instagram ?? null}, guest_instagram),
        guests          = COALESCE(${f.guests == null ? null : Number(f.guests)}, guests),
        amount          = COALESCE(${f.amount == null ? null : Number(f.amount)}, amount),
        payment_status  = COALESCE(${f.payment_status || null}, payment_status),
        comment         = COALESCE(${f.comment ?? null}, comment)
      WHERE id = ${id} AND deleted_at IS NULL
      RETURNING *
    `;
    if (rows[0]) {
      await logBooking({
        entity: "booking", entity_id: id, action: "update", actor: "admin",
        session_id: rows[0].session_id, event_title: rows[0].event_title,
        table_label: rows[0].table_label, guest_name: rows[0].guest_name,
        details: f
      });
    }
    return rows[0] || null;
  } catch (error) {
    if (String(error?.code) === "23505") {
      const err = new Error("Этот столик уже занят на этот сеанс");
      err.code = "TABLE_TAKEN";
      throw err;
    }
    throw error;
  }
}

// Отмена брони — это пометка, а не DELETE: отменённая бронь остаётся в архиве
// со всеми контактами и суммой. Стол при этом сразу освобождается —
// уникальность стола считается только среди живых броней (частичный индекс).
export async function deleteBooking(id, reason) {
  const sql = db();
  const rows = await sql`
    UPDATE bookings SET deleted_at = now(), deleted_reason = ${reason || null}
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING id, session_id, event_title, table_label, guest_name, amount, payment_status
  `;
  const b = rows[0];
  if (!b) return false;
  await logBooking({
    entity: "booking", entity_id: id, action: "delete", actor: "admin",
    session_id: b.session_id, event_title: b.event_title,
    table_label: b.table_label, guest_name: b.guest_name,
    details: { reason: reason || null, amount: b.amount, payment_status: b.payment_status }
  });
  return true;
}

// Отменили по ошибке — вернуть. Не выйдет, если стол уже отдали другому гостю:
// об этом честнее сказать, чем тихо создать второй бронь на одно место.
export async function restoreBooking(id) {
  const sql = db();
  try {
    const rows = await sql`
      UPDATE bookings SET deleted_at = NULL, deleted_reason = NULL
      WHERE id = ${id} AND deleted_at IS NOT NULL
      RETURNING id, session_id, event_title, table_label, guest_name
    `;
    const b = rows[0];
    if (!b) return null;
    await logBooking({
      entity: "booking", entity_id: id, action: "restore", actor: "admin",
      session_id: b.session_id, event_title: b.event_title,
      table_label: b.table_label, guest_name: b.guest_name
    });
    return b;
  } catch (error) {
    if (String(error?.code) === "23505") {
      const err = new Error("Этот столик уже занят на этот сеанс");
      err.code = "TABLE_TAKEN";
      throw err;
    }
    throw error;
  }
}

// Перенос брони на другой сеанс — обычная просьба гостя «перенесите на завтра».
export async function moveBooking(id, sessionId) {
  const sql = db();
  try {
    // Перенос обновляет и снимок: в архиве бронь должна лежать под тем
    // сеансом и той датой, на которых гость в итоге сидел.
    const rows = await sql`
      UPDATE bookings b SET
        session_id   = ${sessionId},
        session_date = s.date,
        session_time = s.time,
        event_title  = COALESCE(s.event_title, b.event_title)
      FROM sessions s
      WHERE s.id = ${sessionId} AND b.id = ${id} AND b.deleted_at IS NULL
      RETURNING b.*
    `;
    if (rows[0]) {
      await logBooking({
        entity: "booking", entity_id: id, action: "move", actor: "admin",
        session_id: sessionId, event_title: rows[0].event_title,
        table_label: rows[0].table_label, guest_name: rows[0].guest_name,
        details: { to_session: sessionId }
      });
    }
    return rows[0] || null;
  } catch (error) {
    if (String(error?.code) === "23505") {
      const err = new Error("На том сеансе этот столик уже занят");
      err.code = "TABLE_TAKEN";
      throw err;
    }
    throw error;
  }
}

// Архив: ЛОГ, а не витрина. Здесь лежит всё, что когда-либо стояло в
// расписании: прошедшие и будущие сеансы, удалённые сеансы, сеансы удалённых
// событий. Название берётся из снимка (s.event_title), поэтому оно остаётся
// на месте, даже если фильм давно снят с показа, а событие удалено.
//
//   scope: 'all' (по умолчанию) | 'past' | 'upcoming'
//   includeDeleted: показывать ли удалённые сеансы (по умолчанию да)
//
// Поиск сделан через EXISTS, а не через условие на LEFT JOIN: в прежнем виде
// join превращался в inner и сеансы без совпавших броней пропадали вместе
// со своими счётчиками.
export async function listArchiveSessions({
  limit = 30, offset = 0, q = "", scope = "all", includeDeleted = true
} = {}) {
  const sql = db();
  const search = String(q || "").trim();
  const like = `%${search}%`;
  const mode = ["all", "past", "upcoming"].includes(scope) ? scope : "all";

  return sql`
    SELECT s.id,
           to_char(s.date, 'DD-MM-YYYY') AS date,
           to_char(s.date, 'YYYY-MM-DD') AS iso,
           s.time,
           COALESCE(e.title, NULLIF(s.event_title, 'Фильм больше не показывается'), 'Название не сохранено') AS title,
           COALESCE(e.format, s.event_format) AS format,
           COALESCE(e.price, s.event_price) AS price,
           (s.deleted_at IS NOT NULL) AS is_deleted,
           (e.id IS NULL) AS event_gone,
           (s.date < (now() + interval '4 hours')::date) AS is_past,
           (count(b.id) FILTER (WHERE b.deleted_at IS NULL))::int AS bookings,
           (count(b.id) FILTER (WHERE b.deleted_at IS NOT NULL))::int AS cancelled,
           COALESCE((sum(b.guests) FILTER (WHERE b.deleted_at IS NULL)), 0)::int AS guests,
           COALESCE((sum(b.amount) FILTER (WHERE b.deleted_at IS NULL)), 0)::numeric AS revenue
    FROM sessions s
    LEFT JOIN events e ON e.id = s.event_id AND e.deleted_at IS NULL
    LEFT JOIN bookings b ON b.session_id = s.id
    WHERE (${mode} = 'all'
           OR (${mode} = 'past'     AND s.date <  (now() + interval '4 hours')::date)
           OR (${mode} = 'upcoming' AND s.date >= (now() + interval '4 hours')::date))
      AND (${includeDeleted} OR s.deleted_at IS NULL)
      AND (${search} = ''
           OR COALESCE(e.title, s.event_title, '') ILIKE ${like}
           OR EXISTS (
                SELECT 1 FROM bookings bs
                WHERE bs.session_id = s.id
                  AND (bs.guest_name ILIKE ${like}
                       OR bs.guest_phone ILIKE ${like}
                       OR bs.guest_instagram ILIKE ${like}
                       OR bs.table_label ILIKE ${like})
              ))
    GROUP BY s.id, s.date, s.time, e.id, e.title, e.format, e.price,
             s.event_title, s.event_format, s.event_price, s.deleted_at
    ORDER BY s.date DESC, s.time DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}

// Прежнее имя — чтобы не ломать существующие вызовы.
export async function listPastSessions(opts = {}) {
  return listArchiveSessions({ ...opts, scope: "past" });
}

// Поиск гостя по всем броням — «этот человек у нас уже был?».
export async function searchGuests(q, limit = 50) {
  const sql = db();
  const search = String(q || "").trim();
  if (!search) return [];
  // LEFT JOIN и снимки в самой брони: гость должен находиться и тогда, когда
  // сеанс удалён, а событие переименовано или удалено вместе с ним.
  // Отменённые брони тоже показываем — с пометкой: «он бронировал и отменил»
  // это ровно тот факт, ради которого в архив и заходят.
  return sql`
    SELECT b.id, b.guest_name, b.guest_phone, b.guest_instagram,
           b.table_label, b.guests, b.amount, b.payment_status, b.source,
           to_char(COALESCE(s.date, b.session_date), 'DD-MM-YYYY') AS date,
           COALESCE(s.time, b.session_time) AS time,
           COALESCE(NULLIF(s.event_title, 'Фильм больше не показывается'), b.event_title, e.title, 'Название не сохранено') AS title,
           b.session_id,
           (b.deleted_at IS NOT NULL) AS is_cancelled,
           b.deleted_reason
    FROM bookings b
    LEFT JOIN sessions s ON s.id = b.session_id
    LEFT JOIN events e ON e.id = s.event_id
    WHERE b.guest_name ILIKE ${'%' + search + '%'}
       OR b.guest_phone ILIKE ${'%' + search + '%'}
       OR b.guest_instagram ILIKE ${'%' + search + '%'}
    ORDER BY COALESCE(s.date, b.session_date) DESC NULLS LAST, b.created_at DESC
    LIMIT ${limit}
  `;
}

// ---------------------------------------------------------------------------
// ФИНАНСЫ
// ---------------------------------------------------------------------------
// Считаем по броням и заказам, которые и так проходят через систему.
//
// Ключевое различие, без которого отчёт врёт: у форматов mov и alacarte цена
// брони — депозит (вычитается из счёта), у din и drink — полная стоимость.
// Поэтому суммы разнесены, а не сложены в одну «выручку».

const FULL_PRICE_FORMATS = ["din", "drink"];

// Построчный список броней за период — лист «Брони» в выгрузке для бухгалтера.
// Сводка отвечает «сколько», этот список — «за что именно»: без него любую
// цифру приходится проверять запросом в базу.
export async function listFinanceBookings(fromIso, toIso) {
  const sql = db();
  return sql`
    SELECT to_char(s.date, 'YYYY-MM-DD') AS iso,
           s.time,
           COALESCE(e.title, NULLIF(s.event_title, 'Фильм больше не показывается'), 'Название не сохранено') AS title,
           COALESCE(e.format, s.event_format) AS format,
           b.table_label, b.guest_name, b.guest_phone, b.guest_instagram,
           b.guests, b.amount, b.payment_status, b.source
    FROM bookings b
    JOIN sessions s ON s.id = b.session_id
    LEFT JOIN events e ON e.id = s.event_id
    WHERE s.date BETWEEN ${fromIso} AND ${toIso}
      AND b.deleted_at IS NULL
      AND s.deleted_at IS NULL
    ORDER BY s.date ASC, s.time ASC, b.table_label ASC
  `;
}

export async function getFinanceSettings() {
  const sql = db();
  const [row] = await sql`SELECT * FROM finance_settings WHERE id = 1`;
  return row || { acquiring_fee_pct: 2.5, tax_pct: 1, currency: "GEL" };
}

export async function saveFinanceSettings({ acquiring_fee_pct, tax_pct }) {
  const sql = db();
  const rows = await sql`
    UPDATE finance_settings SET
      acquiring_fee_pct = COALESCE(${acquiring_fee_pct == null ? null : Number(acquiring_fee_pct)}, acquiring_fee_pct),
      tax_pct           = COALESCE(${tax_pct == null ? null : Number(tax_pct)}, tax_pct),
      updated_at        = now()
    WHERE id = 1 RETURNING *
  `;
  return rows[0];
}

// Отчёт за период. Даты в формате YYYY-MM-DD, включительно.
export async function getFinanceReport(fromIso, toIso) {
  const sql = db();

  // Брони по дням сеанса: разносим по формату и по источнику.
  const byDay = await sql`
    SELECT to_char(s.date, 'DD-MM-YYYY') AS date,
           to_char(s.date, 'YYYY-MM-DD') AS iso,
           COALESCE(e.format, s.event_format) AS format,
           b.source,
           b.payment_status,
           count(*)::int AS bookings,
           COALESCE(sum(b.guests), 0)::int AS guests,
           COALESCE(sum(b.amount), 0)::numeric AS amount
    FROM bookings b
    JOIN sessions s ON s.id = b.session_id
    LEFT JOIN events e ON e.id = s.event_id
    WHERE s.date BETWEEN ${fromIso} AND ${toIso}
      AND b.deleted_at IS NULL
      AND s.deleted_at IS NULL
    GROUP BY s.date, e.format, s.event_format, b.source, b.payment_status
    ORDER BY s.date ASC
  `;

  // Онлайн-платежи по данным банка: это фактические поступления на счёт.
  // Сверять с бронями полезно — расхождение означает, что callback не дошёл.
  const payments = await sql`
    SELECT status,
           count(*)::int AS n,
           COALESCE(sum(amount), 0)::numeric AS amount
    FROM payments
    WHERE created_at::date BETWEEN ${fromIso} AND ${toIso}
    GROUP BY status
  `;

  // Заказы со столика — оборот кухни и бара. Оплата идёт мимо системы,
  // поэтому это не поступления, а справочная величина.
  const orders = await sql`
    SELECT status,
           count(*)::int AS n,
           COALESCE(sum(total), 0)::numeric AS total
    FROM orders
    WHERE created_at::date BETWEEN ${fromIso} AND ${toIso}
    GROUP BY status
  `;

  const topItems = await sql`
    SELECT oi.title, sum(oi.qty)::int AS qty,
           COALESCE(sum(oi.price * oi.qty), 0)::numeric AS amount
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.created_at::date BETWEEN ${fromIso} AND ${toIso}
      AND o.status <> 'cancelled'
    GROUP BY oi.title
    ORDER BY amount DESC
    LIMIT 15
  `;

  const settings = await getFinanceSettings();

  // --- сводим ---
  const days = new Map();
  let depositsPaid = 0, depositsUnpaid = 0;
  let ticketsPaid = 0, ticketsUnpaid = 0;
  let onlineAmount = 0, manualAmount = 0;
  let guests = 0, bookings = 0;

  byDay.forEach((r) => {
    const amount = Number(r.amount) || 0;
    const isFull = FULL_PRICE_FORMATS.includes(r.format);
    const isPaid = r.payment_status === "paid" || r.payment_status === "deposit";

    if (isFull) { isPaid ? (ticketsPaid += amount) : (ticketsUnpaid += amount); }
    else { isPaid ? (depositsPaid += amount) : (depositsUnpaid += amount); }

    if (r.source === "online") onlineAmount += amount; else manualAmount += amount;

    guests += Number(r.guests) || 0;
    bookings += Number(r.bookings) || 0;

    if (!days.has(r.iso)) {
      days.set(r.iso, { iso: r.iso, date: r.date, bookings: 0, guests: 0, tickets: 0, deposits: 0, online: 0, manual: 0 });
    }
    const d = days.get(r.iso);
    d.bookings += Number(r.bookings) || 0;
    d.guests += Number(r.guests) || 0;
    if (isFull) d.tickets += amount; else d.deposits += amount;
    if (r.source === "online") d.online += amount; else d.manual += amount;
  });

  const paidOnline = payments.find((p) => p.status === "paid");
  const onlineCaptured = Number(paidOnline?.amount || 0);
  const fee = onlineCaptured * (Number(settings.acquiring_fee_pct) || 0) / 100;

  // Налоговая база: полная стоимость билетов + депозиты, фактически полученные.
  // Что именно облагается — вопрос к бухгалтеру, поэтому цифра справочная.
  const taxBase = ticketsPaid + depositsPaid;
  const tax = taxBase * (Number(settings.tax_pct) || 0) / 100;

  return {
    period: { from: fromIso, to: toIso },
    settings,
    totals: {
      bookings, guests,
      ticketsPaid, ticketsUnpaid,
      depositsPaid, depositsUnpaid,
      onlineAmount, manualAmount,
      onlineCaptured, fee,
      taxBase, tax,
      netAfterFeeAndTax: taxBase - fee - tax
    },
    payments,
    orders,
    topItems,
    days: [...days.values()].sort((a, b) => a.iso.localeCompare(b.iso))
  };
}

// ---------------------------------------------------------------------------
// НЕДЕЛЯ И БЛОКИРОВКИ СТОЛОВ
// ---------------------------------------------------------------------------

// Сеансы за произвольный период вместе с бронями и блокировками.
// Заменяет вид «Сегодня»: неделя удобнее, потому что расписание живёт неделями,
// а не днями, и администратору нужно видеть, что будет завтра и послезавтра.
export async function getSessionsWithBookingsRange(fromIso, toIso) {
  const sql = db();
  const sessions = await sql`
    SELECT s.id, to_char(s.date, 'DD-MM-YYYY') AS date,
           to_char(s.date, 'YYYY-MM-DD') AS iso, s.time, s.duration,
           COALESCE(e.title, NULLIF(s.event_title, 'Фильм больше не показывается'), 'Название не сохранено') AS title,
           COALESCE(e.format, s.event_format) AS format,
           COALESCE(e.price, s.event_price) AS price,
           COALESCE(s.poster_url, e.poster_url) AS poster_url
    FROM sessions s
    LEFT JOIN events e ON e.id = s.event_id AND e.deleted_at IS NULL
    WHERE s.date BETWEEN ${fromIso} AND ${toIso}
      AND s.deleted_at IS NULL
    ORDER BY s.date ASC, s.time ASC
  `;
  if (!sessions.length) return [];

  const ids = sessions.map((s) => s.id);

  const bookings = await sql`
    SELECT id, session_id, table_label, guest_name, guest_phone, guest_instagram,
           guests, amount, payment_status, source
    FROM bookings WHERE session_id = ANY(${ids}) AND deleted_at IS NULL
    ORDER BY table_label ASC
  `;
  const blocks = await sql`
    SELECT session_id, table_label, reason
    FROM session_table_blocks WHERE session_id = ANY(${ids})
  `;
  const [{ n: tablesTotal }] = await sql`
    SELECT count(*)::int AS n FROM floor_tables WHERE active = true AND bookable = true
  `;

  const bySession = new Map();
  bookings.forEach((b) => {
    if (!bySession.has(b.session_id)) bySession.set(b.session_id, []);
    bySession.get(b.session_id).push(b);
  });
  const blocksBySession = new Map();
  blocks.forEach((b) => {
    if (!blocksBySession.has(b.session_id)) blocksBySession.set(b.session_id, []);
    blocksBySession.get(b.session_id).push(b);
  });

  return sessions.map((s) => {
    const bk = bySession.get(s.id) || [];
    const bl = blocksBySession.get(s.id) || [];
    return {
      ...s,
      bookings: bk,
      blocks: bl,
      guests: bk.reduce((n, b) => n + (Number(b.guests) || 0), 0),
      free: Math.max(0, tablesTotal - bk.length - bl.length)
    };
  });
}

// Закрытые столы конкретного сеанса — нужны и админке, и странице брони.
export async function getSessionBlocks(sessionId) {
  const sql = db();
  return sql`
    SELECT table_label, reason FROM session_table_blocks WHERE session_id = ${sessionId}
  `;
}

export async function blockTable(sessionId, tableLabel, reason) {
  const sql = db();
  const [taken] = await sql`
    SELECT id FROM bookings
    WHERE session_id = ${sessionId} AND table_label = ${tableLabel}
      AND deleted_at IS NULL
  `;
  if (taken) {
    const err = new Error("На этот столик уже есть бронь");
    err.code = "TABLE_TAKEN";
    throw err;
  }
  const rows = await sql`
    INSERT INTO session_table_blocks (session_id, table_label, reason)
    VALUES (${sessionId}, ${tableLabel}, ${reason || null})
    ON CONFLICT (session_id, table_label) DO UPDATE SET reason = EXCLUDED.reason
    RETURNING *
  `;
  return rows[0];
}

export async function unblockTable(sessionId, tableLabel) {
  const sql = db();
  const rows = await sql`
    DELETE FROM session_table_blocks
    WHERE session_id = ${sessionId} AND table_label = ${tableLabel}
    RETURNING table_label
  `;
  return rows.length > 0;
}

// Свободен ли стол для брони с сайта на этом сеансе: учитываем уже
// существующую бронь, постоянное закрытие стола, блокировку под конкретный
// показ, и — soft hold — чужую оплату, которая ещё в процессе (BOG-заказ
// живёт holdMinutes с момента создания payments-записи, см. resolveTtlMinutes
// в lib/bog.js; передавайте то же значение, чтобы hold не пережил сам заказ
// в BOG). Это единственная server-side проверка перед тем, как гостя пустят
// платить в BOG — без неё второй гость мог начать (и завершить) оплату за
// уже забронированный или уже оплачиваемый кем-то стол, и это ловилось
// только уникальным индексом ПОСЛЕ списания денег.
export async function isTableBookableForSession(sessionId, tableLabel, holdMinutes = 30) {
  const sql = db();
  const [already] = await sql`
    SELECT 1 FROM bookings
    WHERE session_id = ${sessionId} AND table_label = ${tableLabel}
      AND deleted_at IS NULL
  `;
  if (already) return false;

  const [held] = await sql`
    SELECT 1 FROM payments
    WHERE session_id = ${sessionId} AND table_label = ${tableLabel}
      AND status = 'pending'
      AND created_at > now() - (${holdMinutes} || ' minutes')::interval
  `;
  if (held) return false;

  const [blocked] = await sql`
    SELECT 1 FROM session_table_blocks
    WHERE session_id = ${sessionId} AND table_label = ${tableLabel}
  `;
  if (blocked) return false;
  return isTableBookable(tableLabel);
}

// Столы, за которые прямо сейчас идёт чья-то оплата (payments.status='pending'
// моложе holdMinutes) — используется публичной /api/availability, чтобы
// виджет показывал такой стол занятым ещё до того, как бронь появится в
// bookings. Симметрично проверке в isTableBookableForSession выше.
export async function getHeldTables(sessionId, holdMinutes = 30) {
  const sql = db();
  const rows = await sql`
    SELECT DISTINCT table_label FROM payments
    WHERE session_id = ${sessionId} AND status = 'pending'
      AND table_label IS NOT NULL
      AND created_at > now() - (${holdMinutes} || ' minutes')::interval
  `;
  return rows.map((r) => r.table_label).filter(Boolean);
}

// ---- дополнительные размещения позиций ----
// Одна позиция может стоять в нескольких категориях, оставаясь одной записью:
// описание и фото правятся в одном месте, а цена может отличаться по категориям.

export async function getPlacements(itemIds) {
  const sql = db();
  if (!itemIds || !itemIds.length) return [];
  return sql`
    SELECT p.item_id, p.category_id, p.subcategory_id, p.sort, p.price, p.in_overview,
           c.title_ru AS category_title, c.menu_key
    FROM menu_item_placements p
    JOIN menu_categories c ON c.id = p.category_id
    WHERE p.item_id = ANY(${itemIds})
    ORDER BY p.sort ASC
  `;
}

export async function addPlacement({ item_id, category_id, subcategory_id, price, sort }) {
  const sql = db();
  const [item] = await sql`SELECT category_id FROM menu_items WHERE id = ${item_id}`;
  if (!item) {
    const err = new Error("Позиция не найдена");
    err.code = "NOT_FOUND";
    throw err;
  }
  // Своя категория уже есть у самой позиции — дублировать её в размещения
  // нельзя, иначе блюдо задвоится в списке.
  if (item.category_id === category_id) {
    const err = new Error("Это и есть основная категория позиции");
    err.code = "SAME_CATEGORY";
    throw err;
  }
  const rows = await sql`
    INSERT INTO menu_item_placements (item_id, category_id, subcategory_id, sort, price)
    VALUES (${item_id}, ${category_id}, ${subcategory_id || null},
            ${Number(sort) || 0}, ${price == null || price === "" ? null : Number(price)})
    ON CONFLICT (item_id, category_id) DO UPDATE SET
      subcategory_id = EXCLUDED.subcategory_id,
      sort = EXCLUDED.sort,
      price = EXCLUDED.price
    RETURNING *
  `;
  return rows[0];
}

export async function removePlacement(itemId, categoryId) {
  const sql = db();
  const rows = await sql`
    DELETE FROM menu_item_placements
    WHERE item_id = ${itemId} AND category_id = ${categoryId}
    RETURNING item_id
  `;
  return rows.length > 0;
}
