// One-off migration: live Google Sheets -> Neon Postgres.
//
// Reuses the project's existing Sheets auth (lib/sheets.js readRows), so no
// separate export step or service-account setup is needed - it reads the live
// spreadsheet directly using the same GOOGLE_* envs the app already uses.
//
// Usage:
//   node scripts/migrate.mjs [--dry]
//   (needs GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY,
//    and DATABASE_URL in the environment; e.g. node --env-file=.env scripts/migrate.mjs --dry)
//
// --dry prints the report without writing to Postgres.
//
// Order of operations (matters for correctness):
//   1. events  (incl. a synthetic "archived" event for no-longer-shown films)
//   2. sessions from Ссылки, keyed by legacy eid
//   3. online bookings from payments(status=paid) -> ensure their session exists
//   4. manual bookings from Bookings sheet -> match session by title+date+time,
//      else attach to the archived event; skip if that table on that session is
//      already taken by an online booking (online wins).
// Everything unmatched is printed in a final report.

import { neon } from "@neondatabase/serverless";
import { readRows } from "../lib/sheets.js";
import {
  mapEvents,
  mapSessions,
  mapOnlineBookings,
  mapManualBookings,
  normTitle,
  ARCHIVED_EVENT,
  parseReserveLink
} from "../lib/migrate-core.js";
import crypto from "crypto";

const DRY = process.argv.includes("--dry");

// Turns raw sheet rows [[header...],[row...]] into [{header: value}] objects,
// matching what migrate-core expects. Blank rows are dropped.
function rowsToDicts(rows) {
  if (!rows || !rows.length) return [];
  const [header, ...data] = rows;
  return data
    .map((r) => {
      const obj = {};
      let empty = true;
      header.forEach((h, i) => {
        if (h == null || h === "") return;
        const v = r[i];
        if (v != null && v !== "") empty = false;
        obj[h] = v ?? null;
      });
      return empty ? null : obj;
    })
    .filter(Boolean);
}

// Reads the four source sheets live, in the shape migrate-core expects.
async function loadData() {
  const eventsSheet = process.env.EVENTS_SHEET_NAME || "events";
  const linksSheet = process.env.LINKS_SHEET_NAME || "Ссылки";
  const paymentsSheet = process.env.PAYMENTS_SHEET_NAME || "payments";
  const bookingsSheet = process.env.BOOKINGS_SHEET_NAME || "Bookings";

  // FORMATTED_STRING for dates/times so we get 'DD-MM-YYYY'/'HH:MM'-ish text
  // that migrate-core's toDdMmYyyy/toHhMm already handle.
  const opts = { dateTimeRenderOption: "FORMATTED_STRING" };

  const [eventsRows, linksRows, paymentsRows, bookingsRows] = await Promise.all([
    readRows(eventsSheet, "A:E", opts),
    readRows(linksSheet, "A:C", opts),
    readRows(paymentsSheet, "A:O", opts),
    readRows(bookingsSheet, "A:R", opts)
  ]);

  return {
    events: rowsToDicts(eventsRows),
    // links: keep only the 3rd column (the reserve link)
    links: (linksRows || []).slice(1).map((r) => ({ link: r[2] || "" })).filter((x) => x.link),
    payments: rowsToDicts(paymentsRows),
    bookings: rowsToDicts(bookingsRows)
  };
}

const sql = DRY ? null : neon(process.env.DATABASE_URL);
const gid = (p) => `${p}_${crypto.randomBytes(4).toString("hex")}`;

const report = {
  events: 0,
  sessions: 0,
  onlineBookings: 0,
  manualBookings: 0,
  archivedBookings: 0,
  skippedManual: [],
  skippedOnline: [],
  skippedSessions: [],
  dupTableSkipped: []
};

// eid -> event db id ; "eid|date|time" -> session db id
const eventIdByEid = new Map();
const sessionIdByKey = new Map();
const sessionEventByKey = new Map(); // sessionKey -> event db id (for lookup)

function sessKey(eid, date, time) {
  return `${eid}|${date}|${time}`;
}

async function ensureEvent(ev) {
  if (eventIdByEid.has(ev.legacy_eid)) return eventIdByEid.get(ev.legacy_eid);
  const id = gid("ev");
  if (!DRY) {
    await sql`
      INSERT INTO events (id, tmdb_id, title, poster_url, format, price, deposit_text)
      VALUES (${id}, ${ev.tmdb_id || null}, ${ev.title}, ${ev.poster_url || null},
              ${ev.format || "mov"}, ${ev.price || 0}, ${ev.deposit_text || null})
    `;
  }
  eventIdByEid.set(ev.legacy_eid, id);
  report.events++;
  return id;
}

async function ensureSession({ legacy_eid, date, time, poster }) {
  const key = sessKey(legacy_eid, date, time);
  if (sessionIdByKey.has(key)) return sessionIdByKey.get(key);

  const eventId = eventIdByEid.get(legacy_eid);
  if (!eventId) {
    report.skippedSessions.push({ reason: "no event for eid", legacy_eid, date, time });
    return null;
  }

  const id = gid("s");
  const iso = ddmmyyyyToIso(date);
  if (!iso) {
    report.skippedSessions.push({ reason: "bad date", legacy_eid, date, time });
    return null;
  }

  if (!DRY) {
    await sql`
      INSERT INTO sessions (id, event_id, date, time, duration)
      VALUES (${id}, ${eventId}, ${iso}, ${time}, ${120})
    `;
  }
  sessionIdByKey.set(key, id);
  sessionEventByKey.set(key, eventId);
  report.sessions++;
  return id;
}

async function insertBooking(sessionId, b) {
  const id = b.id || gid("b");
  if (!DRY) {
    try {
      await sql`
        INSERT INTO bookings
          (id, session_id, table_label, guest_name, guest_phone, guests,
           amount, payment_status, source, wa_status)
        VALUES
          (${id}, ${sessionId}, ${b.table_label}, ${b.guest_name || null},
           ${b.guest_phone || null}, ${b.guests || null}, ${b.amount || null},
           ${b.payment_status || "paid"}, ${b.source || "manual"}, ${b.wa_status || null})
        ON CONFLICT (session_id, table_label) DO NOTHING
      `;
    } catch (e) {
      // ON CONFLICT handles the unique clash; anything else is real
      throw e;
    }
  }
  return id;
}

function ddmmyyyyToIso(v) {
  const m = String(v || "").match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

async function run() {
  // Read the live spreadsheet (reuses the app's Sheets auth).
  const data = await loadData();

  // Safety: this one-off script is not idempotent (it generates fresh ids on
  // every run). Refuse to run against a non-empty DB so a second accidental
  // run can't double everything. Ongoing sync (Stage 3) handles upserts.
  if (!DRY) {
    const existing = await sql`SELECT count(*)::int AS n FROM events`;
    if (existing[0].n > 0) {
      console.error(
        `Refusing to migrate: events table already has ${existing[0].n} rows.\n` +
        "This script is for a one-time load into an EMPTY database.\n" +
        "If you really want to re-run, TRUNCATE bookings, payments, sessions, events first."
      );
      process.exit(1);
    }
  }

  // 1. EVENTS (+ archived catch-all)
  const { events } = mapEvents(data.events || []);
  for (const ev of events) await ensureEvent(ev);
  await ensureEvent(ARCHIVED_EVENT);

  const knownTitles = new Set(events.map((e) => normTitle(e.title)));

  // 2. SESSIONS from Ссылки
  const { sessions, report: sRep } = mapSessions(data.links || []);
  report.skippedSessions.push(...sRep.skipped);
  for (const s of sessions) await ensureSession(s);

  // 3. ONLINE bookings from payments
  const { bookings: online, sessionsToEnsure, report: oRep } =
    mapOnlineBookings(data.payments || []);
  report.skippedOnline.push(...oRep.skipped);
  // ensure their sessions exist (online sales may reference a session not in Ссылки)
  for (const s of sessionsToEnsure) await ensureSession(s);
  const onlineTaken = new Set(); // "sessionId|table" already booked online
  for (const b of online) {
    const sid = sessionIdByKey.get(sessKey(b.legacy_eid, b.date, b.time));
    if (!sid) {
      report.skippedOnline.push({ reason: "no session", ...b });
      continue;
    }
    await insertBooking(sid, b);
    onlineTaken.add(`${sid}|${b.table_label.toLowerCase()}`);
    report.onlineBookings++;
  }

  // 4. MANUAL bookings from Bookings sheet
  const archivedEventId = eventIdByEid.get(ARCHIVED_EVENT.legacy_eid);
  const { bookings: manual, report: mRep } =
    mapManualBookings(data.bookings || [], knownTitles);
  report.skippedManual.push(...mRep.skipped);

  // Build a title+date+time -> sessionId index for matching manual rows.
  // (session titles come from their event.)
  const titleDateTimeToSession = new Map();
  for (const [key, sid] of sessionIdByKey.entries()) {
    const [eid, date, time] = key.split("|");
    const evId = eventIdByEid.get(eid);
    // find the event title for this eid
    const ev = events.find((e) => e.legacy_eid === eid);
    if (!ev) continue;
    titleDateTimeToSession.set(`${normTitle(ev.title)}|${date}|${time}`, sid);
  }

  for (const b of manual) {
    let sid = null;

    if (!b.is_archived) {
      sid = titleDateTimeToSession.get(`${normTitle(b.match_title)}|${b.date}|${b.time}`) || null;
    }

    // archived film, or live film with no matching session -> attach an
    // archived session (one per date+time under the archived event).
    if (!sid) {
      const archKey = sessKey(ARCHIVED_EVENT.legacy_eid, b.date, b.time);
      if (sessionIdByKey.has(archKey)) {
        sid = sessionIdByKey.get(archKey);
      } else {
        const id = gid("s");
        const iso = ddmmyyyyToIso(b.date);
        if (iso) {
          if (!DRY) {
            await sql`
              INSERT INTO sessions (id, event_id, date, time, duration)
              VALUES (${id}, ${archivedEventId}, ${iso}, ${b.time}, ${120})
            `;
          }
          sessionIdByKey.set(archKey, id);
          report.sessions++;
          sid = id;
        }
      }
      if (b.is_archived) report.archivedBookings++;
    }

    if (!sid) {
      report.skippedManual.push({ reason: "no session + bad date", ...b });
      continue;
    }

    // Online booking wins: skip manual dup on same session+table.
    if (onlineTaken.has(`${sid}|${b.table_label.toLowerCase()}`)) {
      report.dupTableSkipped.push({ table: b.table_label, date: b.date, time: b.time });
      continue;
    }

    await insertBooking(sid, b);
    report.manualBookings++;
  }

  // ---- report ----
  console.log("\n===== MIGRATION REPORT" + (DRY ? " (DRY RUN)" : "") + " =====");
  console.log("events inserted:        ", report.events);
  console.log("sessions inserted:      ", report.sessions);
  console.log("online bookings:        ", report.onlineBookings);
  console.log("manual bookings:        ", report.manualBookings);
  console.log("  of which archived:    ", report.archivedBookings);
  console.log("manual dup skipped:     ", report.dupTableSkipped.length, "(online already booked that table)");
  console.log("skipped online:         ", report.skippedOnline.length);
  console.log("skipped manual:         ", report.skippedManual.length);
  console.log("skipped sessions:       ", report.skippedSessions.length);

  if (report.skippedManual.length) {
    console.log("\n-- skipped manual (first 20) --");
    report.skippedManual.slice(0, 20).forEach((x) => console.log("  ", JSON.stringify(x)));
  }
  if (report.skippedOnline.length) {
    console.log("\n-- skipped online (first 20) --");
    report.skippedOnline.slice(0, 20).forEach((x) => console.log("  ", JSON.stringify(x)));
  }
  if (report.skippedSessions.length) {
    console.log("\n-- skipped sessions (first 20) --");
    report.skippedSessions.slice(0, 20).forEach((x) => console.log("  ", JSON.stringify(x)));
  }
  console.log("\nDone." + (DRY ? " (no data written)" : ""));
}

run().catch((e) => {
  console.error("MIGRATION FAILED:", e);
  process.exit(1);
});
