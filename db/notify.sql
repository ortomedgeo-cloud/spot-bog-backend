-- Настройки каналов уведомлений (Telegram / WhatsApp / Почта).
-- Выполнить один раз в Neon SQL Editor. Безопасно перезапускать (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS notify_settings (
  channel     TEXT PRIMARY KEY,              -- telegram | whatsapp | email
  enabled     BOOLEAN NOT NULL DEFAULT true,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO notify_settings (channel, enabled) VALUES
  ('telegram', true), ('whatsapp', true), ('email', true)
ON CONFLICT (channel) DO NOTHING;

-- Токены/ключи, введённые из админки. Значение хранится зашифрованным
-- (AES-256-GCM, lib/secrets.js) — ключ шифрования лежит в переменной
-- окружения NOTIFY_SECRET_KEY, а не в базе. Без этой строки в таблице канал
-- просто берёт значение из обычной переменной окружения (TELEGRAM_BOT_TOKEN
-- и т.п.) — запись из админки имеет приоритет, но не обязательна.
CREATE TABLE IF NOT EXISTS notify_secrets (
  channel     TEXT NOT NULL,
  name        TEXT NOT NULL,                 -- имя переменной, напр. TELEGRAM_BOT_TOKEN
  value       TEXT NOT NULL,                 -- зашифровано
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (channel, name)
);
