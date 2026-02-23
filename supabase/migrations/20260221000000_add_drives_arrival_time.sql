-- Add optional arrival time for drives.
ALTER TABLE public.drives
ADD COLUMN IF NOT EXISTS arrival_time time;
