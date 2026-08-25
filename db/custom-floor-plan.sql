-- Кастомная рассадка под конкретное событие (или под один сеанс).
-- Выполнить один раз в Neon SQL Editor.
--
-- Зачем: на части показов зал расставляют иначе — гости сидят по одному за
-- столом, столы разворачивают к экрану, часть убирают. Раньше поменять можно
-- было только вместимость (event_table_overrides), а сама геометрия была одна
-- на все события: подвинешь стол под киноужин — он подвинется и на обычном
-- показе.
--
-- Теперь план можно скопировать и изменить целиком, и он будет действовать
-- ТОЛЬКО на своё событие (все его сеансы) или ТОЛЬКО на один сеанс.
-- Порядок разрешения при показе схемы: план сеанса → план события → общий
-- план зала из floor_tables.
--
-- Метки столов остаются теми же, что в общем плане: метка связывает бронь с
-- местом, и своя метка на своём плане означала бы, что архив перестанет
-- понимать, где сидел гость.

CREATE TABLE IF NOT EXISTS custom_floor_plans (
  id           TEXT PRIMARY KEY,
  event_id     TEXT REFERENCES events(id)   ON DELETE CASCADE,
  session_id   TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  canvas_w     INTEGER NOT NULL DEFAULT 1000,
  canvas_h     INTEGER NOT NULL DEFAULT 700,
  screen_label TEXT    NOT NULL DEFAULT 'SCREEN',
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- План привязан ровно к одному: либо к событию, либо к сеансу.
  CONSTRAINT custom_floor_plans_scope CHECK (
    (event_id IS NOT NULL AND session_id IS NULL) OR
    (event_id IS NULL AND session_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_custom_plan_event
  ON custom_floor_plans(event_id) WHERE event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_custom_plan_session
  ON custom_floor_plans(session_id) WHERE session_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS custom_floor_tables (
  plan_id      TEXT NOT NULL REFERENCES custom_floor_plans(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,
  zone         TEXT NOT NULL DEFAULT 'hall',
  shape        TEXT NOT NULL DEFAULT 'rect',
  x            INTEGER NOT NULL DEFAULT 0,
  y            INTEGER NOT NULL DEFAULT 0,
  w            INTEGER NOT NULL DEFAULT 90,
  h            INTEGER NOT NULL DEFAULT 90,
  rotation     INTEGER NOT NULL DEFAULT 0,
  capacity_min INTEGER NOT NULL DEFAULT 1,
  capacity_max INTEGER NOT NULL DEFAULT 4,
  sort         INTEGER NOT NULL DEFAULT 0,
  active       BOOLEAN NOT NULL DEFAULT true,
  bookable     BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (plan_id, label)
);

CREATE INDEX IF NOT EXISTS idx_custom_floor_tables_plan ON custom_floor_tables(plan_id);
