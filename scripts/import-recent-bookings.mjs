// Imports ONLY bookings from the Bookings sheet into Postgres — no events, no
// sessions from Ссылки, no payments. For catching up manual bookings staff
// kept writing into Excel after the main migration.
//
// Usage:
//   DATABASE_URL='...' node --env-file=.env scripts/import-recent-bookings.mjs [--since=27-07-2026] [--dry]
//
// Matching logic per booking row (title + date + time):
//   1. exact match against an EXISTING session in the DB (event title
//      normalized + date + time) -> attach there;
//   2. otherwise -> attach to a session under the "Фильм больше не
//      показывается" placeholder event for that date+time (created if
//      missing), so nothing is lost and you can re-attach it later via
//      admin "Изм." / batch reassign;
//   3. same table already booked on that session -> skipped (reported).
//
// Idempotent: inserts use ON CONFLICT (session_id, table_label) DO NOTHING,
// so re-running never duplicates.

import { neon } from "@neondatabase/serverless";
import crypto from "crypto";
import { readRows } from "../lib/sheets.js";
import { mapManualBookings, normTitle, ARCHIVED_EVENT } from "../lib/migrate-core.js";

const DRY = process.argv.includes("--dry");
const sinceArg = (process.argv.find((a) => a.startsWith("--since=")) || "").split("=")[1];
const SINCE_DDMM = sinceArg || "27-07-2026";

function ddmmToIso(s) {
  const m = String(s || "").match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

const SINCE_ISO = ddmmToIso(SINCE_DDMM);
if (!SINCE_ISO) {
  console.error(`Bad --since date: ${SINCE_DDMM} (expected DD-MM-YYYY)`);
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const gid = () => `manual_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;

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

async function run() {
  console.log(`Importing manual bookings since ${SINCE_DDMM}${DRY ? " (DRY RUN)" : ""}\n`);

  // 1. Read the Bookings sheet (dates as serial numbers — locale-proof).
  const bookingsSheet = process.env.BOOKINGS_SHEET_NAME || "Bookings";
  const raw = await readRows(bookingsSheet, "A:R", {
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "SERIAL_NUMBER"
  });
  const rows = rowsToDicts(raw);

  // 2. Load current DB state: sessions index + event titles + archived event.
  const dbSessions = await sql`
    SELECT s.id, s.event_id, to_char(s.date, 'DD-MM-YYYY') AS date,
           to_char(s.date, 'YYYY-MM-DD') AS iso, s.time, e.title
    FROM sessions s JOIN events e ON e.id = s.event_id
  `;
  const dbEvents = await sql`SELECT id, title FROM events`;

  const knownTitles = new Set(dbEvents.map((e) => normTitle(e.title)));
  const sessionByKey = new Map(); // normTitle|DD-MM-YYYY|HH:MM -> session id
  const archСessionByDt = new Map(); // date|time -> archived session id
  let archivedEventId = null;

  for (const e of dbEvents) {
    if (e.title === ARCHIVED_EVENT.title) archivedEventId = e.id;
  }
  for (const s of dbSessions) {
    sessionByKey.set(`${normTitle(s.title)}|${s.date}|${s.time}`, s.id);
    if (archivedEventId && s.event_id === archivedEventId) {
      archСessionByDt.set(`${s.date}|${s.time}`, s.id);
    }
  }

  // 3. Map sheet rows -> booking records (same converter as the migration).
  const { bookings, report: mrep } = mapManualBookings(rows, knownTitles);

  // 4. Filter by date >= since.
  const recent = bookings.filter((b) => {
    const iso = ddmmToIso(b.date);
    return iso && iso >= SINCE_ISO;
  });

  console.log(`Sheet rows mapped: ${bookings.length}, in range: ${recent.length}, unmappable: ${mrep.skipped.length}`);

  const rep = { real: 0, archived: 0, dup: 0, inserted: [], dups: [], skipped: mrep.skipped };

  for (const b of recent) {
    // find target session
    let sid = sessionByKey.get(`${normTitle(b.match_title)}|${b.date}|${b.time}`) || null;
    let toArchived = false;

    if (!sid) {
      toArchived = true;
      const key = `${b.date}|${b.time}`;
      sid = archСessionByDt.get(key) || null;

      if (!sid) {
        // need the archived event (create once if the DB somehow lacks it)
        if (!archivedEventId) {
          archivedEventId = `ev_${crypto.randomBytes(4).toString("hex")}`;
          if (!DRY) {
            await sql`
              INSERT INTO events (id, title, format, price)
              VALUES (${archivedEventId}, ${ARCHIVED_EVENT.title}, 'mov', 0)
            `;
          }
        }
        sid = `s_${crypto.randomBytes(4).toString("hex")}`;
        const iso = ddmmToIso(b.date);
        if (!DRY) {
          await sql`
            INSERT INTO sessions (id, event_id, date, time, duration)
            VALUES (${sid}, ${archivedEventId}, ${iso}, ${b.time}, 120)
          `;
        }
        archСessionByDt.set(key, sid);
      }
    }

    // insert booking, skipping duplicates on (session, table)
    let inserted = true;
    if (!DRY) {
      const r = await sql`
        INSERT INTO bookings
          (id, session_id, table_label, guest_name, guest_phone, guests,
           amount, payment_status, source)
        VALUES
          (${gid()}, ${sid}, ${b.table_label}, ${b.guest_name}, ${b.guest_phone},
           ${b.guests}, ${b.amount}, ${b.payment_status}, 'manual')
        ON CONFLICT (session_id, table_label) DO NOTHING
        RETURNING id
      `;
      inserted = r.length > 0;
    }

    if (!inserted) {
      rep.dup++;
      rep.dups.push(`${b.date} ${b.time} ${b.table_label} (${b.guest_name || "—"})`);
    } else if (toArchived) {
      rep.archived++;
      rep.inserted.push(`${b.date} ${b.time} ${b.table_label} ${b.guest_name || "—"} -> АРХИВ («${b.match_title}» не найден среди сеансов)`);
    } else {
      rep.real++;
      rep.inserted.push(`${b.date} ${b.time} ${b.table_label} ${b.guest_name || "—"} -> «${b.match_title}»`);
    }
  }

  console.log(`\n===== REPORT${DRY ? " (DRY)" : ""} =====`);
  console.log(`attached to real sessions: ${rep.real}`);
  console.log(`attached to archive:       ${rep.archived}  (переназначь через админку: Сеансы -> галочки -> «переназначить на…»)`);
  console.log(`duplicates skipped:        ${rep.dup}`);
  if (rep.inserted.length) {
    console.log(`\n-- inserted --`);
    rep.inserted.forEach((x) => console.log("  ", x));
  }
  if (rep.dups.length) {
    console.log(`\n-- duplicates (already in DB) --`);
    rep.dups.forEach((x) => console.log("  ", x));
  }
  if (rep.skipped.length) {
    console.log(`\n-- unmappable rows (bad date/time/table) --`);
    rep.skipped.slice(0, 10).forEach((x) => console.log("  ", JSON.stringify(x)));
  }
  console.log(`\nDone.${DRY ? " (nothing written)" : ""}`);
}

run().catch((e) => {
  console.error("IMPORT FAILED:", e);
  process.exit(1);
});
