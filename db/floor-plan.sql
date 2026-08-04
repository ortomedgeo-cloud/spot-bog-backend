-- План зала: расположение столов на схеме.
-- Выполнить один раз в Neon SQL Editor.
--
-- Ключ стола — его МЕТКА («Стол 5», «Бар 2»): именно она лежит в bookings и
-- по ней система понимает, что место занято. План задаёт только геометрию для
-- существующих меток, поэтому переименование стола здесь не должно ломать
-- прошлые брони — об этом предупреждает админка.
--
-- Холст в условных единицах (по умолчанию 1000×700); страница брони
-- масштабирует его под ширину экрана, поэтому схема одинаково выглядит
-- и на телефоне, и на десктопе.

CREATE TABLE IF NOT EXISTS floor_settings (
  id            INTEGER PRIMARY KEY DEFAULT 1,
  canvas_w      INTEGER NOT NULL DEFAULT 1000,
  canvas_h      INTEGER NOT NULL DEFAULT 700,
  grid          INTEGER NOT NULL DEFAULT 20,
  screen_label  TEXT    NOT NULL DEFAULT 'SCREEN',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT floor_settings_single_row CHECK (id = 1)
);

INSERT INTO floor_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS floor_tables (
  label        TEXT PRIMARY KEY,             -- «Стол 5», «Бар 2» — как в bookings
  zone         TEXT NOT NULL DEFAULT 'hall', -- hall | bar
  shape        TEXT NOT NULL DEFAULT 'rect', -- rect | circle
  x            INTEGER NOT NULL DEFAULT 0,
  y            INTEGER NOT NULL DEFAULT 0,
  w            INTEGER NOT NULL DEFAULT 90,
  h            INTEGER NOT NULL DEFAULT 90,
  rotation     INTEGER NOT NULL DEFAULT 0,
  capacity_min INTEGER NOT NULL DEFAULT 1,
  capacity_max INTEGER NOT NULL DEFAULT 4,
  sort         INTEGER NOT NULL DEFAULT 0,
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_floor_tables_active ON floor_tables(active, sort);

-- Стартовый план: те же 10 столов и 4 барных места, что были захардкожены.
-- Расставлены сеткой — в редакторе их можно двигать как угодно.
INSERT INTO floor_tables (label, zone, shape, x, y, w, h, capacity_min, capacity_max, sort) VALUES
  ('Стол 1',  'hall', 'circle', 120, 140, 90, 90, 1, 4, 10),
  ('Стол 2',  'hall', 'circle', 260, 140, 90, 90, 1, 4, 20),
  ('Стол 3',  'hall', 'circle', 400, 140, 90, 90, 1, 4, 30),
  ('Стол 4',  'hall', 'circle', 540, 140, 90, 90, 1, 4, 40),
  ('Стол 5',  'hall', 'circle', 680, 140, 90, 90, 1, 4, 50),
  ('Стол 6',  'hall', 'circle', 120, 300, 90, 90, 1, 4, 60),
  ('Стол 7',  'hall', 'circle', 260, 300, 90, 90, 1, 4, 70),
  ('Стол 8',  'hall', 'circle', 400, 300, 90, 90, 1, 4, 80),
  ('Стол 9',  'hall', 'rect',   540, 300, 140, 90, 3, 6, 90),
  ('Стол 10', 'hall', 'rect',   700, 300, 140, 90, 3, 6, 100),
  ('Бар 1',   'bar',  'rect',   140, 520, 70, 60, 1, 2, 110),
  ('Бар 2',   'bar',  'rect',   230, 520, 70, 60, 1, 2, 120),
  ('Бар 3',   'bar',  'rect',   320, 520, 70, 60, 1, 2, 130),
  ('Бар 4',   'bar',  'rect',   410, 520, 70, 60, 1, 2, 140)
ON CONFLICT (label) DO NOTHING;

-- Закрытый стол: виден на схеме, но забронировать его с сайта нельзя.
-- Отличается от active: active=false убирает стол со схемы совсем, а закрытый
-- показывается серым с подписью — гость видит, что место существует, но занято
-- под своё (ремонт, служебный столик, бронь по телефону).
-- Персонал в админке при этом посадить за него может.
ALTER TABLE floor_tables ADD COLUMN IF NOT EXISTS bookable BOOLEAN NOT NULL DEFAULT true;
