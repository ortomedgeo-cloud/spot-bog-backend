-- Free-text staff note per booking (birthday, allergy, "call before arrival",
-- whatever doesn't fit the structured fields). Run once in Neon SQL Editor.

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS comment TEXT;
