-- Add Luma integration support

-- Add luma_event_id to drives
ALTER TABLE drives ADD COLUMN luma_event_id TEXT;
CREATE UNIQUE INDEX drives_luma_event_id_unique ON drives (luma_event_id) WHERE luma_event_id IS NOT NULL;

-- Add luma_guest_id to volunteer_availability for webhook idempotency
ALTER TABLE volunteer_availability ADD COLUMN luma_guest_id TEXT;
CREATE UNIQUE INDEX volunteer_availability_luma_guest_id_unique ON volunteer_availability (luma_guest_id) WHERE luma_guest_id IS NOT NULL;

-- Add 'luma' to volunteer_source enum
ALTER TYPE volunteer_source ADD VALUE IF NOT EXISTS 'luma';

-- Add default_daig_count config (used when auto-creating drives from Luma)
INSERT INTO app_config (key, value, description)
VALUES (
  'default_daig_count',
  '5',
  'Default daig count for drives auto-created from Luma events'
)
ON CONFLICT (key) DO NOTHING;
