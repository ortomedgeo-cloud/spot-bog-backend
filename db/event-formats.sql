-- Event formats — was a hardcoded object in api/admin.js, now a small lookup
-- table so staff can add new formats (e.g. "Movie Brunch") from the admin UI
-- instead of editing code. Run once in Neon SQL Editor.
--
-- code       — same short key stored in events.format ('mov', 'din', ...)
-- price_kind — 'deposit' (price is deducted from the table bill) or
--              'included' (price is the full ticket/set-menu price)
-- deposit_text — cancellation/terms template shown to the guest, prefilled
--                into the event form when this format is picked

CREATE TABLE IF NOT EXISTS event_formats (
  code         TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  price_kind   TEXT NOT NULL DEFAULT 'deposit' CHECK (price_kind IN ('deposit', 'included')),
  deposit_text TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed with the formats that used to live in api/admin.js so existing
-- events (format='mov'/'din'/'drink'/'alacarte') keep working unchanged.
INSERT INTO event_formats (code, title, price_kind, deposit_text, sort_order) VALUES
(
  'mov',
  'Movie Night — обычный показ',
  'deposit',
  '(вычитается из общей суммы счёта) ❗️Бронь столика на фильм нельзя отменить. Если у Вас не получается посетить этот показ, мы можем перенести Ваше бронирование на другой день! По всем вопросам обращайтесь к нам в директ Instagram.',
  0
),
(
  'din',
  'Movie Dinner Night — киноужин',
  'included',
  '(сет-меню входит в стоимость) ❗️Условия отмены: отмена за 3 дня до мероприятия и ранее - возвращается 100% суммы
- отмена за 2 дня - взвращается 50%
- отмена за день и в день мероприятия - сумма за билет сгорает.',
  1
),
(
  'drink',
  'Movie Drinking Night',
  'included',
  '(сет-меню входит в стоимость) ❗️Условия отмены: отмена за 3 дня до мероприятия и ранее - возвращается 100% суммы
- отмена за 2 дня - взвращается 50%
- отмена за день и в день мероприятия - сумма за билет сгорает.',
  2
),
(
  'alacarte',
  'Movie Night Á La Carte',
  'deposit',
  '(депозит вычитается из общей суммы счёта) ❗️Бронь столика на фильм нельзя отменить. Если у Вас не получается посетить этот показ, мы можем перенести Ваше бронирование на другой день! По всем вопросам обращайтесь к нам в директ Instagram.',
  3
)
ON CONFLICT (code) DO NOTHING;
