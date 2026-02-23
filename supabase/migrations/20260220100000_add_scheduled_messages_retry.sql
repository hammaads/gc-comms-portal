-- Add retry support to scheduled_messages
alter table public.scheduled_messages
  add column if not exists retry_count integer not null default 0;

-- Index for the cron job: find failed messages eligible for retry
create index if not exists idx_scheduled_messages_retry
  on public.scheduled_messages (scheduled_at)
  where status = 'failed' and retry_count < 3;
