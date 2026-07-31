-- Переключатели каналов уведомлений (Telegram / WhatsApp / Почта).
-- Выполнить один раз в Neon SQL Editor.
--
-- Секреты (токены, ключи) здесь не хранятся — только флаг вкл/выкл на канал.
-- Отсутствующая строка для канала трактуется кодом как enabled = true, так
-- что система работает и до выполнения этого файла.

CREATE TABLE IF NOT EXISTS notify_settings (
  channel     TEXT PRIMARY KEY,              -- telegram | whatsapp | email
  enabled     BOOLEAN NOT NULL DEFAULT true,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO notify_settings (channel, enabled) VALUES
  ('telegram', true), ('whatsapp', true), ('email', true)
ON CONFLICT (channel) DO NOTHING;
