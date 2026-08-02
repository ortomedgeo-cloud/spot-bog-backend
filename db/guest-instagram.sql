-- Инстаграм гостя отдельным полем.
-- Выполнить один раз в Neon SQL Editor.
--
-- Раньше форма брони присылала customer_instagram, но бэкенд его не сохранял,
-- а гости нередко писали ник прямо в поле телефона — из-за этого в базе
-- лежат брони с контактом вида «@nickname», куда невозможно ни позвонить,
-- ни отправить подтверждение в WhatsApp.
--
-- Теперь телефон обязателен и проверяется, а ник живёт в своей колонке.

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS guest_instagram TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS guest_instagram TEXT;
