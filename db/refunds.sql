-- Refund tracking. Run once in the Neon SQL Editor.
--
-- payments.status stays pending|paid|failed (unchanged meaning: was the order
-- captured). refund_status is a separate, independent lifecycle:
--   NULL -> 'requested' -> 'partially_refunded' | 'refunded'
-- refund_status can move from 'partially_refunded' back to 'requested' when a
-- follow-up partial/final refund call is made — see api/admin-refund.js.
--
-- bookings.payment_status is plain TEXT with no CHECK constraint, so it just
-- gains a new value 'refunded' (see STATUSES in api/admin-bookings.js) — no
-- ALTER needed on that table.

ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_status TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_requested_amount NUMERIC(10,2);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(10,2);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_action_id TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_requested_at TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;
