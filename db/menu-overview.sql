-- «Показывать в общем списке» для категорий и подкатегорий.
-- Выполнить один раз в Neon SQL Editor (после db/menu-featured.sql).
--
-- Прежняя логика была с ловушкой: пока в категории ничего не отмечено —
-- показывалось всё, поэтому целую категорию («Соусы») скрыть было нельзя,
-- а большая («Крепкий алкоголь») пряталась лишь как побочный эффект того,
-- что рядом что-то отметили.
--
-- Теперь прямо: по умолчанию видно всё, а лишнее снимается галочкой.
-- Категория со снятой галочкой не появляется в «Всё меню» целиком;
-- подкатегория со снятой — её позиции не показываются в общем списке;
-- отдельную позицию тоже можно убрать из общего списка её собственной галочкой.
-- Внутри самой категории видно по-прежнему всё.

ALTER TABLE menu_categories    ADD COLUMN IF NOT EXISTS in_overview BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE menu_subcategories ADD COLUMN IF NOT EXISTS in_overview BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE menu_items         ADD COLUMN IF NOT EXISTS in_overview BOOLEAN NOT NULL DEFAULT true;

-- Ничего не прячем на старте: сначала всё видно, дальше снимаешь галочки
-- у того, что загромождает главную.
UPDATE menu_categories    SET in_overview = true WHERE in_overview IS NULL;
UPDATE menu_subcategories SET in_overview = true WHERE in_overview IS NULL;
UPDATE menu_items         SET in_overview = true WHERE in_overview IS NULL;
