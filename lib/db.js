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
export async function createSession({ event_id, date, time, duration = 120, poster_url }) {
  const sql = db();
  const iso = ddmmyyyyToIso(date);
  if (!iso) throw new Error(`Invalid date: ${date}`);

  const id = genId("s");
  const rows = await sql`
    INSERT INTO sessions (id, event_id, date, time, duration, poster_url)
    VALUES (${id}, ${event_id}, ${iso}, ${String(time).trim()}, ${duration}, ${poster_url || null})
    RETURNING id, event_id, to_char(date, 'DD-MM-YYYY') AS date, time, duration, poster_url
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
           e.title, COALESCE(s.poster_url, e.poster_url) AS poster_url,
           s.poster_url AS own_poster_url, e.format, e.price,
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
  return rows[0] || null;
}

export async function getSession(id) {
  const sql = db();
  const rows = await sql`
    SELECT s.id, s.event_id,
           to_char(s.date, 'DD-MM-YYYY') AS date, s.time, s.duration,
           e.title, COALESCE(s.poster_url, e.poster_url) AS poster_url,
           s.poster_url AS own_poster_url, e.format, e.price, e.deposit_text
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
  guest_instagram,
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
        (id, session_id, table_label, guest_name, guest_phone, guest_instagram, guests,
         amount, payment_status, source, wa_status)
      VALUES
        (${bookingId}, ${session_id}, ${table_label}, ${guest_name || null},
         ${guest_phone || null}, ${guest_instagram || null}, ${guests || null}, ${amount || null},
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
           e.title, COALESCE(s.poster_url, e.poster_url) AS poster_url, e.format, e.price
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

// ---------------------------------------------------------------------------
// BATCH OPERATIONS (admin)
// ---------------------------------------------------------------------------
// Deletes CASCADE: removing a session removes its bookings; removing an event
// removes its sessions and their bookings. The admin UI warns before calling.

export async function deleteSessionsByIds(ids) {
  const sql = db();
  const rows = await sql`
    DELETE FROM sessions WHERE id = ANY(${ids}) RETURNING id
  `;
  return rows.length;
}

export async function deleteEventsByIds(ids) {
  const sql = db();
  const rows = await sql`
    DELETE FROM events WHERE id = ANY(${ids}) RETURNING id
  `;
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
    SELECT s.id AS session_id, to_char(s.date, 'DD-MM-YYYY') AS date, s.time,
           e.title, e.price, COALESCE(s.poster_url, e.poster_url) AS poster_url, e.format
    FROM sessions s
    JOIN events e ON e.id = s.event_id
    WHERE e.title <> 'Фильм больше не показывается'
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
export async function getPublicMenu(lang = "ru") {
  const sql = db();
  const l = ["ru", "ka", "en"].includes(lang) ? lang : "ru";

  const cats = await sql`
    SELECT id, sort, in_overview, title_ru, title_ka, title_en
    FROM menu_categories WHERE visible = true ORDER BY sort ASC, created_at ASC
  `;
  if (!cats.length) return [];

  const catIds = cats.map((c) => c.id);

  const subs = await sql`
    SELECT id, category_id, sort, in_overview, title_ru, title_ka, title_en
    FROM menu_subcategories
    WHERE category_id = ANY(${catIds})
    ORDER BY sort ASC, created_at ASC
  `;

  const items = await sql`
    SELECT id, category_id, subcategory_id, sort, in_overview, title_ru, title_ka, title_en,
           desc_ru, desc_ka, desc_en, price, photo_url, photo_hover_url
    FROM menu_items
    WHERE available = true AND category_id = ANY(${catIds})
    ORDER BY sort ASC, created_at ASC
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
  return { categories, subcategories, items };
}

export async function createMenuCategory({ title_ru, title_ka, title_en, sort }) {
  const sql = db();
  const rows = await sql`
    INSERT INTO menu_categories (id, sort, title_ru, title_ka, title_en)
    VALUES (${menuId("mc")}, ${Number(sort) || 0}, ${title_ru},
            ${title_ka || null}, ${title_en || null})
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
      in_overview = COALESCE(${typeof f.in_overview === "boolean" ? f.in_overview : null}, in_overview)
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

// Лента для админки: заказы за последние N часов вместе со строками.
export async function listOrders(hours = 24) {
  const sql = db();
  const orders = await sql`
    SELECT * FROM orders
    WHERE created_at > now() - (${hours} || ' hours')::interval
    ORDER BY created_at DESC
  `;
  if (!orders.length) return [];

  const items = await sql`
    SELECT order_id, title, price, qty FROM order_items
    WHERE order_id = ANY(${orders.map((o) => o.id)})
  `;
  const byOrder = new Map();
  items.forEach((i) => {
    if (!byOrder.has(i.order_id)) byOrder.set(i.order_id, []);
    byOrder.get(i.order_id).push(i);
  });

  return orders.map((o) => ({ ...o, items: byOrder.get(o.id) || [] }));
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
export async function getPublicFloorPlan() {
  const sql = db();
  const [settings] = await sql`SELECT canvas_w, canvas_h, screen_label FROM floor_settings WHERE id = 1`;
  const tables = await sql`
    SELECT label, zone, shape, x, y, w, h, rotation, capacity_min, capacity_max
    FROM floor_tables WHERE active = true ORDER BY sort ASC, label ASC
  `;
  return {
    settings: settings || { canvas_w: 1000, canvas_h: 700, screen_label: "SCREEN" },
    tables
  };
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
        (label, zone, shape, x, y, w, h, rotation, capacity_min, capacity_max, sort, active)
      VALUES
        (${t.label}, ${t.zone || "hall"}, ${t.shape || "rect"},
         ${Number(t.x) || 0}, ${Number(t.y) || 0},
         ${Number(t.w) || 90}, ${Number(t.h) || 90}, ${Number(t.rotation) || 0},
         ${Number(t.capacity_min) || 1}, ${Number(t.capacity_max) || 4},
         ${Number(t.sort) || 0}, ${t.active !== false})
      ON CONFLICT (label) DO UPDATE SET
        zone = EXCLUDED.zone, shape = EXCLUDED.shape,
        x = EXCLUDED.x, y = EXCLUDED.y, w = EXCLUDED.w, h = EXCLUDED.h,
        rotation = EXCLUDED.rotation,
        capacity_min = EXCLUDED.capacity_min, capacity_max = EXCLUDED.capacity_max,
        sort = EXCLUDED.sort, active = EXCLUDED.active
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
    SELECT count(*)::int AS count FROM bookings WHERE table_label = ${label}
  `;
  await sql`DELETE FROM floor_tables WHERE label = ${label}`;
  return { deleted: true, bookings: count };
}

// Метки, на которые уже есть брони — их переименование или удаление
// осмысленно только с предупреждением.
export async function floorLabelsInUse() {
  const sql = db();
  const rows = await sql`
    SELECT table_label, count(*)::int AS n FROM bookings GROUP BY table_label
  `;
  return Object.fromEntries(rows.map((r) => [r.table_label, r.n]));
}
