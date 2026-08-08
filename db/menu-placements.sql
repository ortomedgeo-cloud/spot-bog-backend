-- Одна позиция в нескольких категориях.
-- Выполнить один раз в Neon SQL Editor.
--
-- Зачем: коктейль один, а показать его надо и в основном меню, и в баре у
-- бассейна. Копировать позицию нельзя — тогда описание и фото придётся править
-- в двух местах, и они разъедутся.
--
-- Своя категория позиции остаётся в menu_items.category_id (основное место).
-- Здесь — только ДОПОЛНИТЕЛЬНЫЕ размещения.
--
-- price: если задана — цена именно в этой категории. У бассейна свой прайс
-- (20 GEL), в основном меню тот же коктейль может стоить иначе. Пусто —
-- берётся цена самой позиции.

CREATE TABLE IF NOT EXISTS menu_item_placements (
  item_id        TEXT NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  category_id    TEXT NOT NULL REFERENCES menu_categories(id) ON DELETE CASCADE,
  subcategory_id TEXT REFERENCES menu_subcategories(id) ON DELETE SET NULL,
  sort           INTEGER NOT NULL DEFAULT 0,
  price          NUMERIC(10,2),
  in_overview    BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_placements_category ON menu_item_placements(category_id, sort);
