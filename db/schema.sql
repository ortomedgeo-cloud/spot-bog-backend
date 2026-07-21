-- SPOT. booking system — Postgres schema (Neon)
-- Run once against your Neon database (psql or the Neon SQL editor).
--
-- Model:
--   event   = a film + format (mov/din) + price + deposit text. Created once.
--   session = one screening of an event: a date + time. An event has many.
--   booking = a reserved table for a specific session.
--   payment = a BOG payment attempt tied to a session + table.
--
-- IDs are opaque text (e.g. 'ev_ab12cd', 's_9x8y7z'), generated in the app,
-- so they read well in reserve links and never collide/reuse like the old eids.

CREATE TABLE IF NOT EXISTS events (
  id           TEXT PRIMARY KEY,
  tmdb_id      BIGINT,
  title        TEXT NOT NULL,
  poster_url   TEXT,
  format       TEXT NOT NULL DEFAULT 'mov',   -- 'mov' | 'din'
  price        NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  deposit_text TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  event_id    TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  date        DATE NOT NULL,                    -- stored as real DATE, no locale mess
  time        TEXT NOT NULL,                    -- 'HH:MM' as shown to guests
  duration    INTEGER NOT NULL DEFAULT 120,     -- minutes
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_event ON sessions(event_id);
CREATE INDEX IF NOT EXISTS idx_sessions_date  ON sessions(date);

CREATE TABLE IF NOT EXISTS bookings (
  id             TEXT PRIMARY KEY,              -- booking id (also used as internal_order_id for paid ones)
  session_id     TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  table_label    TEXT NOT NULL,                 -- 'Стол 4' / 'Бар 2'
  guest_name     TEXT,
  guest_phone    TEXT,
  guests         INTEGER,
  amount         NUMERIC(10,2),
  payment_status TEXT NOT NULL DEFAULT 'unpaid',-- 'paid' | 'deposit' | 'unpaid'
  source         TEXT NOT NULL DEFAULT 'online',-- 'online' | 'manual'
  wa_status      TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One table can only be booked once per session:
  UNIQUE (session_id, table_label)
);

CREATE INDEX IF NOT EXISTS idx_bookings_session ON bookings(session_id);

CREATE TABLE IF NOT EXISTS payments (
  id                  BIGSERIAL PRIMARY KEY,
  internal_order_id   TEXT UNIQUE NOT NULL,     -- our id sent to BOG as external_order_id
  bog_order_id        TEXT,
  status              TEXT NOT NULL DEFAULT 'pending', -- pending | paid | failed
  session_id          TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  event_title         TEXT,
  table_label         TEXT,
  guests              INTEGER,
  amount              NUMERIC(10,2),
  guest_name          TEXT,
  guest_phone         TEXT,
  reserve_url         TEXT,
  green_notified_at   TIMESTAMPTZ,
  raw_callback        JSONB,
  comment             TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_bog       ON payments(bog_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_internal  ON payments(internal_order_id);
