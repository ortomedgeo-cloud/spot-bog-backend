-- Настройки финансового отчёта.
-- Выполнить один раз в Neon SQL Editor.
--
-- Ставки не зашиты в код: комиссия эквайринга зависит от договора с банком,
-- налоговый режим — от статуса ИП. Меняются в админке без правки кода.
--
-- ВАЖНО про смысл цифр:
--   * У форматов mov и alacarte цена брони — ДЕПОЗИТ, он вычитается из счёта.
--     Считать его выручкой нельзя: гость доплатит по счёту, а депозит зачтётся.
--   * У din и drink цена — полная стоимость, это и есть выручка.
--   * Заказы со столика (orders) — оборот кухни и бара, оплата проходит мимо
--     системы, поэтому они идут отдельной строкой, а не в поступления.

CREATE TABLE IF NOT EXISTS finance_settings (
  id                INTEGER PRIMARY KEY DEFAULT 1,
  acquiring_fee_pct NUMERIC(5,2) NOT NULL DEFAULT 2.50,  -- комиссия банка за онлайн-оплату
  tax_pct           NUMERIC(5,2) NOT NULL DEFAULT 1.00,  -- налог с оборота
  currency          TEXT NOT NULL DEFAULT 'GEL',
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT finance_settings_single_row CHECK (id = 1)
);

INSERT INTO finance_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
