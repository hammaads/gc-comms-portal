-- Revert volunteer identity to phone-only.
-- A volunteer is uniquely identified by phone, regardless of name variations.

-- Normalize obvious whitespace inconsistencies.
UPDATE public.volunteers
SET phone = trim(phone)
WHERE phone <> trim(phone);

UPDATE public.volunteers
SET name = trim(name)
WHERE name <> trim(name);

-- Build duplicate map by phone, keeping the earliest volunteer row.
CREATE TEMP TABLE volunteer_phone_dedup_map ON COMMIT DROP AS
WITH ranked AS (
  SELECT
    id,
    phone,
    row_number() OVER (
      PARTITION BY phone
      ORDER BY created_at ASC, id ASC
    ) AS rn,
    first_value(id) OVER (
      PARTITION BY phone
      ORDER BY created_at ASC, id ASC
    ) AS keep_id
  FROM public.volunteers
)
SELECT id AS dupe_id, keep_id
FROM ranked
WHERE rn > 1;

-- Merge availability rows and skip duplicates.
INSERT INTO public.volunteer_availability (
  volunteer_id,
  drive_id,
  source,
  signed_up_at,
  created_at
)
SELECT
  m.keep_id,
  va.drive_id,
  va.source,
  va.signed_up_at,
  va.created_at
FROM volunteer_phone_dedup_map m
JOIN public.volunteer_availability va
  ON va.volunteer_id = m.dupe_id
ON CONFLICT (volunteer_id, drive_id) DO NOTHING;

-- Reassign related records from duplicate volunteer IDs to kept IDs.
UPDATE public.assignments a
SET volunteer_id = m.keep_id
FROM volunteer_phone_dedup_map m
WHERE a.volunteer_id = m.dupe_id;

UPDATE public.communication_log cl
SET volunteer_id = m.keep_id
FROM volunteer_phone_dedup_map m
WHERE cl.volunteer_id = m.dupe_id;

DO $$
BEGIN
  IF to_regclass('public.scheduled_messages') IS NOT NULL THEN
    UPDATE public.scheduled_messages sm
    SET volunteer_id = m.keep_id
    FROM volunteer_phone_dedup_map m
    WHERE sm.volunteer_id = m.dupe_id;
  END IF;
END
$$;

-- Delete duplicate volunteer rows once references are reassigned.
DELETE FROM public.volunteers v
USING volunteer_phone_dedup_map m
WHERE v.id = m.dupe_id;

-- Restore phone-only uniqueness.
DROP INDEX IF EXISTS public.volunteers_phone_name_unique;
CREATE UNIQUE INDEX IF NOT EXISTS volunteers_phone_unique
  ON public.volunteers (phone);
