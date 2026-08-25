-- Архив хранит ВСЁ.
-- Выполнить один раз в Neon SQL Editor.
--
-- Проблема, которую чинит эта миграция: архив был не логом, а витриной над
-- живыми таблицами. Отмена брони делала DELETE, удаление сеанса уносило брони
-- по CASCADE, удаление события — сеансы вместе с бронями, а название бралось
-- JOIN'ом с events, поэтому удалённое событие превращало историю в
-- «Фильм больше не показывается». То есть ровно та информация, ради которой
-- архив и нужен, исчезала первой.
--
-- Принцип после миграции: из админки НИЧЕГО не удаляется физически, только
-- помечается deleted_at. А то, что показывается в архиве, лежит в самой
-- записи снимком (event_title, session_date, session_time) и не зависит от
-- того, живо ли ещё событие и как оно теперь называется.

-- 1. Мягкое удаление вместо DELETE ------------------------------------------

ALTER TABLE events   ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Почему отменили бронь: «не пришли», «перенесли», «оплата не прошла».
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deleted_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_events_live   ON events(deleted_at);
CREATE INDEX IF NOT EXISTS idx_sessions_live ON sessions(deleted_at);
CREATE INDEX IF NOT EXISTS idx_bookings_live ON bookings(deleted_at);

-- 2. Снимки названий ---------------------------------------------------------
-- Название события копируется в сеанс, а название/дата/время — в бронь, в
-- момент создания. Дальше переименование или удаление события на историю уже
-- не влияет: архив читает снимок, а не events.

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS event_title  TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS event_format TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS event_price  NUMERIC(10,2);

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS event_title  TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS session_date DATE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS session_time TEXT;

-- Бэкфилл по тому, что ещё живо. Сеансы, чьё событие удалили ДО этой миграции,
-- получат 'Фильм больше не показывается' — настоящее название для них уже
-- потеряно, восстановить его неоткуда.
UPDATE sessions s
SET event_title  = COALESCE(s.event_title, e.title),
    event_format = COALESCE(s.event_format, e.format),
    event_price  = COALESCE(s.event_price, e.price)
FROM events e
WHERE e.id = s.event_id AND s.event_title IS NULL;

UPDATE bookings b
SET event_title  = COALESCE(b.event_title, s.event_title),
    session_date = COALESCE(b.session_date, s.date),
    session_time = COALESCE(b.session_time, s.time)
FROM sessions s
WHERE s.id = b.session_id AND b.session_date IS NULL;

-- 3. Ссылки больше не уносят историю ----------------------------------------
-- Даже если кто-то удалит строку руками из SQL-редактора, брони останутся:
-- ссылка обнулится, а снимок названия и даты никуда не денется.

ALTER TABLE sessions ALTER COLUMN event_id   DROP NOT NULL;
ALTER TABLE bookings ALTER COLUMN session_id DROP NOT NULL;

DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname, conrelid::regclass AS tbl
    FROM pg_constraint
    WHERE contype = 'f'
      AND conrelid IN ('sessions'::regclass, 'bookings'::regclass)
      AND confrelid IN ('events'::regclass, 'sessions'::regclass)
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.tbl, c.conname);
  END LOOP;
END $$;

ALTER TABLE sessions ADD CONSTRAINT sessions_event_id_fkey
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL;

ALTER TABLE bookings ADD CONSTRAINT bookings_session_id_fkey
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL;

-- 4. Уникальность стола — только среди живых броней -------------------------
-- UNIQUE(session_id, table_label) в прежнем виде означал бы, что отменённая
-- бронь навсегда занимает стол: посадить туда нового гостя нельзя.

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_session_id_table_label_key;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_bookings_live_table
  ON bookings(session_id, table_label)
  WHERE deleted_at IS NULL;

-- 5. Журнал изменений --------------------------------------------------------
-- Кто, когда и что сделал с бронью. Пишется только вперёд, ничего не
-- обновляется и не удаляется: это и есть лог. Снимки полей внутри — чтобы
-- строка журнала читалась сама по себе через год.

CREATE TABLE IF NOT EXISTS booking_log (
  id          BIGSERIAL PRIMARY KEY,
  at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  entity      TEXT NOT NULL,          -- booking | session | event
  entity_id   TEXT NOT NULL,
  action      TEXT NOT NULL,          -- create | update | move | delete | restore
  actor       TEXT,                   -- admin | online | system
  session_id  TEXT,
  event_title TEXT,
  table_label TEXT,
  guest_name  TEXT,
  details     JSONB
);

CREATE INDEX IF NOT EXISTS idx_booking_log_at      ON booking_log(at DESC);
CREATE INDEX IF NOT EXISTS idx_booking_log_entity  ON booking_log(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_booking_log_session ON booking_log(session_id);

-- 6. Похороны заглушки «Фильм больше не показывается» ------------------------
-- Раньше удаление события перевешивало прошедшие сеансы на общее событие-
-- заглушку, и в архиве вместо названия оставалось «Фильм больше не
-- показывается». Настоящее название при этом ещё лежит в payments.event_title:
-- туда оно попадало снимком в момент оплаты. Достаём оттуда.

UPDATE sessions s
SET event_title = src.title
FROM (
  SELECT DISTINCT ON (p.session_id) p.session_id, p.event_title AS title
  FROM payments p
  WHERE p.session_id IS NOT NULL
    AND p.event_title IS NOT NULL
    AND btrim(p.event_title) <> ''
    AND p.event_title <> 'Фильм больше не показывается'
  ORDER BY p.session_id, p.created_at ASC
) src
WHERE src.session_id = s.id
  AND (s.event_title IS NULL OR s.event_title = 'Фильм больше не показывается');

-- То же из броней, если снимок в них уже есть (брони, созданные после
-- миграции, или восстановленные вручную).
UPDATE sessions s
SET event_title = src.title
FROM (
  SELECT DISTINCT ON (b.session_id) b.session_id, b.event_title AS title
  FROM bookings b
  WHERE b.session_id IS NOT NULL
    AND b.event_title IS NOT NULL
    AND btrim(b.event_title) <> ''
    AND b.event_title <> 'Фильм больше не показывается'
  ORDER BY b.session_id, b.created_at ASC
) src
WHERE src.session_id = s.id
  AND (s.event_title IS NULL OR s.event_title = 'Фильм больше не показывается');

-- Что не восстановилось — обнуляем: пустое поле честнее вранья про то, что
-- фильм «больше не показывается». Админка покажет «Название не сохранено»
-- и даст вписать название руками.
UPDATE sessions SET event_title = NULL
WHERE event_title = 'Фильм больше не показывается';

-- Снимок в бронях подтягиваем к обновлённому названию сеанса.
UPDATE bookings b
SET event_title = s.event_title
FROM sessions s
WHERE s.id = b.session_id
  AND s.event_title IS NOT NULL
  AND (b.event_title IS NULL OR b.event_title = 'Фильм больше не показывается');

-- Сеансы отвязываем от заглушки, саму заглушку убираем из списков.
UPDATE sessions SET event_id = NULL
WHERE event_id IN (SELECT id FROM events WHERE title = 'Фильм больше не показывается');

UPDATE events SET deleted_at = COALESCE(deleted_at, now())
WHERE title = 'Фильм больше не показывается';
