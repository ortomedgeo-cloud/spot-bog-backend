-- Своя вместимость столов под конкретное событие.
-- Выполнить один раз в Neon SQL Editor.
--
-- floor_tables.capacity_min/max — вместимость по умолчанию, общая для всех
-- событий. Иногда нужно другое под конкретное событие (например, на части
-- Movie Dinner столы на 4 рассаживают только по 2). Строка здесь переопределяет
-- вместимость этого стола для этого события; действует на все сеансы события.
-- Нет строки — используется вместимость по умолчанию из floor_tables.
--
-- table_label намеренно не FK на floor_tables.label — так же, как в
-- session_table_blocks: переименование стола не должно ломать прошлые записи.

CREATE TABLE IF NOT EXISTS event_table_overrides (
  event_id     TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  table_label  TEXT NOT NULL,
  capacity_min INTEGER NOT NULL,
  capacity_max INTEGER NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, table_label)
);

CREATE INDEX IF NOT EXISTS idx_event_table_overrides_event ON event_table_overrides(event_id);
