-- Обслуживание за столом: заказы из меню и быстрые просьбы (официант, счёт,
-- плед, зарядка, пепельница). Выполнить один раз в Neon SQL Editor.
--
-- Замысел:
--   * Просьбы и заказы — разные сущности. У просьбы нет позиций и суммы, она
--     должна улетать мгновенно; заказ — это корзина с позициями и итогом.
--   * Строки заказа хранят СНИМОК названия и цены. Меню живое: если цена
--     изменится, вчерашние заказы не должны переписаться. Ссылка на позицию
--     меню остаётся, но ON DELETE SET NULL — удалённое блюдо не рушит историю.
--   * table_label — та же метка, что в бронях («Стол 5», «Бар 2»), приходит из
--     QR-кода на столе, а не вводится руками.

CREATE TABLE IF NOT EXISTS service_requests (
  id          TEXT PRIMARY KEY,              -- sr_xxxxxxxx
  table_label TEXT NOT NULL,
  kind        TEXT NOT NULL,                 -- waiter | bill | blanket | charger | ashtray
  comment     TEXT,
  lang        TEXT,                          -- на каком языке гость смотрел меню
  status      TEXT NOT NULL DEFAULT 'new',   -- new | done
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id          TEXT PRIMARY KEY,              -- o_xxxxxxxx
  table_label TEXT NOT NULL,
  guest_name  TEXT,
  comment     TEXT,
  mode        TEXT NOT NULL DEFAULT 'in_venue', -- in_venue | takeaway
  lang        TEXT,
  total       NUMERIC(10,2) NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'new',   -- new | accepted | done | cancelled
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
  id            TEXT PRIMARY KEY,            -- oi_xxxxxxxx
  order_id      TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id  TEXT REFERENCES menu_items(id) ON DELETE SET NULL,
  title         TEXT NOT NULL,               -- снимок на момент заказа
  price         NUMERIC(10,2) NOT NULL,      -- снимок на момент заказа
  qty           INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_orders_created  ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status   ON orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_ord ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_sr_created      ON service_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sr_status       ON service_requests(status, created_at DESC);
