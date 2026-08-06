-- Столы, закрытые под конкретный сеанс.
-- Выполнить один раз в Neon SQL Editor.
--
-- Отличается от floor_tables.bookable: там стол закрыт всегда (сломан, служебный),
-- здесь — только на один показ. Типичный случай: «на сегодня стол 5 под стафф»
-- или «этот столик держим для гостя, который договорился по телефону».
--
-- Стол при этом виден на схеме, но забронировать его с сайта нельзя;
-- администратор посадить за него может.

CREATE TABLE IF NOT EXISTS session_table_blocks (
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  table_label TEXT NOT NULL,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, table_label)
);

CREATE INDEX IF NOT EXISTS idx_blocks_session ON session_table_blocks(session_id);
