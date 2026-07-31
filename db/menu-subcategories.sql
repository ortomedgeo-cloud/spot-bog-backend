-- Подкатегории меню и вторая фотография для эффекта наведения.
-- Выполнить один раз в Neon SQL Editor (после db/menu.sql).
--
-- Подкатегория — это фильтр внутри категории: «Авторские коктейли» делятся на
-- «На основе джина», «Кислые», и т.п. Переводы нужны те же три языка, что и у
-- категорий, поэтому это полноценная таблица, а не текстовое поле у позиции.
--
-- Позиция может быть без подкатегории: тогда на сайте она видна всегда, а в
-- конструкторе лежит в группе «Без подкатегории». ON DELETE SET NULL — удаление
-- подкатегории не уносит с собой блюда.

CREATE TABLE IF NOT EXISTS menu_subcategories (
  id          TEXT PRIMARY KEY,              -- ms_xxxxxxxx
  category_id TEXT NOT NULL REFERENCES menu_categories(id) ON DELETE CASCADE,
  sort        INTEGER NOT NULL DEFAULT 0,
  title_ru    TEXT NOT NULL,
  title_ka    TEXT,
  title_en    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS subcategory_id TEXT
    REFERENCES menu_subcategories(id) ON DELETE SET NULL;

-- Вторая фотография: показывается при наведении на карточку (как на старом
-- сайте у авторских коктейлей). Пустая — карточка просто не меняется.
ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS photo_hover_url TEXT;

CREATE INDEX IF NOT EXISTS idx_menu_subcat_category ON menu_subcategories(category_id, sort);
CREATE INDEX IF NOT EXISTS idx_menu_items_subcat    ON menu_items(subcategory_id);
