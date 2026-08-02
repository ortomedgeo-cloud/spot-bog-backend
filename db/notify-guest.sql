-- Канал уведомлений гостю (WhatsApp на номер из брони).
-- Выполнить один раз в Neon SQL Editor.
--
-- Отдельная строка, потому что это принципиально другой канал: staff-канал
-- шлёт в фиксированный чат персонала, гостевой — на номер конкретного человека.
-- Выключать их надо независимо.

INSERT INTO notify_settings (channel, enabled)
VALUES ('guest_whatsapp', true)
ON CONFLICT (channel) DO NOTHING;
