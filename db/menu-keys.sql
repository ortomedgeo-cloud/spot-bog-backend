-- Разные меню на одной базе: основное и барная карта у бассейна.
-- Выполнить один раз в Neon SQL Editor.
--
-- Позиции у бассейна — свои: там свой набор коктейлей и своя цена (20 GEL
-- против цен основного меню). Поэтому это отдельные категории, а не метки
-- на существующих блюдах — иначе цену пришлось бы хранить в двух местах.
--
-- Категория принадлежит одному меню. /api/menu?menu=pool отдаёт только его.
-- Значение произвольное: захотите террасу или банкет — просто новый ключ.

ALTER TABLE menu_categories ADD COLUMN IF NOT EXISTS menu_key TEXT NOT NULL DEFAULT 'main';
CREATE INDEX IF NOT EXISTS idx_menu_categories_key ON menu_categories(menu_key, sort);
