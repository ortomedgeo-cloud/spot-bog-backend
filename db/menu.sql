-- Menu schema (kitchen, cocktails, wine, ...). Run once in the Neon SQL editor.
--
-- Design notes:
--   * Translations live in per-language columns (ru/ka/en) rather than a
--     separate translations table: only three languages, always fetched
--     together, and it keeps the admin form trivial.
--   * ru is the working language and is NOT NULL; ka/en may be empty and the
--     API falls back to ru so an untranslated item still renders.
--   * `available` is the day-to-day switch staff flip when something runs out;
--     `visible` hides a whole category. Deleting is for real removals only.
--   * Prices are per item; portion/size variants are deliberately NOT modelled
--     yet — add a menu_item_variants table later if the bar needs them.
--   * Item ids are stable text ids so future order lines can reference them
--     without breaking when the menu is re-sorted.

CREATE TABLE IF NOT EXISTS menu_categories (
  id          TEXT PRIMARY KEY,              -- mc_xxxxxxxx
  sort        INTEGER NOT NULL DEFAULT 0,
  title_ru    TEXT NOT NULL,
  title_ka    TEXT,
  title_en    TEXT,
  visible     BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS menu_items (
  id          TEXT PRIMARY KEY,              -- mi_xxxxxxxx
  category_id TEXT NOT NULL REFERENCES menu_categories(id) ON DELETE CASCADE,
  sort        INTEGER NOT NULL DEFAULT 0,
  title_ru    TEXT NOT NULL,
  title_ka    TEXT,
  title_en    TEXT,
  desc_ru     TEXT,
  desc_ka     TEXT,
  desc_en     TEXT,
  price       NUMERIC(10,2) NOT NULL DEFAULT 0,
  photo_url   TEXT,
  available   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_sort     ON menu_items(category_id, sort);
CREATE INDEX IF NOT EXISTS idx_menu_categories_sort ON menu_categories(sort);
