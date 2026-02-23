-- NOTE:
-- This file is intended to be run once on a fresh database/schema
-- (for example when you first provision your Supabase project).
-- Do NOT re-run this after the schema already exists or after
-- running clear_all_data.sql. To reset data + restore defaults,
-- run clear_all_data.sql and then reseed_defaults.sql instead.

-- Migration 1: Enable required Postgres extensions
create extension if not exists "moddatetime" with schema extensions;
-- Migration 2: Create all 7 enum types
create type public.drive_status as enum ('draft', 'open', 'in_progress', 'completed', 'cancelled');
create type public.assignment_status as enum ('assigned', 'confirmed', 'en_route', 'arrived', 'completed', 'cancelled', 'no_show', 'waitlisted');
create type public.capacity_mode as enum ('linear', 'tiered');
create type public.comm_channel as enum ('whatsapp', 'ai_call', 'manual');
create type public.call_result as enum ('confirmed', 'en_route', 'delayed', 'not_coming', 'no_answer', 'voicemail', 'failed');
create type public.gender as enum ('male', 'female');
create type public.volunteer_source as enum ('google_form', 'in_app_form', 'manual', 'bulk_import');
-- Migration 3: Seasons table
create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  end_date date not null,
  hijri_year integer,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger handle_seasons_updated_at
  before update on public.seasons
  for each row
  execute function extensions.moddatetime(updated_at);
-- Migration 4: Volunteers table
create table public.volunteers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  email text,
  gender public.gender not null,
  organization text,
  source public.volunteer_source not null default 'manual',
  is_active boolean not null default true,
  total_drives_attended integer not null default 0,
  whatsapp_jid text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index volunteers_phone_unique on public.volunteers (phone);

create trigger handle_volunteers_updated_at
  before update on public.volunteers
  for each row
  execute function extensions.moddatetime(updated_at);
-- Migration 5: Drives table
create table public.drives (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  name text not null,
  drive_date date not null,
  daig_count integer not null default 0,
  volunteer_target integer,
  location_name text,
  location_address text,
  location_lat double precision,
  location_lng double precision,
  arrival_time time,
  sunset_time time,
  sunset_source text,
  iftaar_time time,
  status public.drive_status not null default 'draft',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index drives_season_id_idx on public.drives (season_id);
create index drives_drive_date_idx on public.drives (drive_date);

alter table public.drives
  add constraint drives_location_lat_check
    check (location_lat is null or (location_lat >= -90 and location_lat <= 90)),
  add constraint drives_location_lng_check
    check (location_lng is null or (location_lng >= -180 and location_lng <= 180));

create trigger handle_drives_updated_at
  before update on public.drives
  for each row
  execute function extensions.moddatetime(updated_at);
-- Migration 6: Duties table
create table public.duties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  display_order integer not null default 0,
  gender_restriction public.gender,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger handle_duties_updated_at
  before update on public.duties
  for each row
  execute function extensions.moddatetime(updated_at);
-- Migration 7: Drive Duties table (per-drive duty slots with capacity)
create table public.drive_duties (
  id uuid primary key default gen_random_uuid(),
  drive_id uuid not null references public.drives(id) on delete cascade,
  duty_id uuid not null references public.duties(id) on delete cascade,
  capacity_mode public.capacity_mode not null default 'linear',
  calculated_capacity integer not null default 0,
  manual_capacity_override integer,
  current_assigned integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index drive_duties_drive_duty_unique on public.drive_duties (drive_id, duty_id);
create index drive_duties_drive_id_idx on public.drive_duties (drive_id);

create trigger handle_drive_duties_updated_at
  before update on public.drive_duties
  for each row
  execute function extensions.moddatetime(updated_at);
-- Migration 8: Duty Capacity Rules table
create table public.duty_capacity_rules (
  id uuid primary key default gen_random_uuid(),
  duty_id uuid not null references public.duties(id) on delete cascade,
  capacity_mode public.capacity_mode not null default 'linear',
  base_count integer,
  per_daig_count numeric,
  tier_min_daigs integer,
  tier_max_daigs integer,
  tier_capacity integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index duty_capacity_rules_duty_id_idx on public.duty_capacity_rules (duty_id);

create trigger handle_duty_capacity_rules_updated_at
  before update on public.duty_capacity_rules
  for each row
  execute function extensions.moddatetime(updated_at);
-- Migration 9: Volunteer Availability (drive sign-ups)
create table public.volunteer_availability (
  id uuid primary key default gen_random_uuid(),
  volunteer_id uuid not null references public.volunteers(id) on delete cascade,
  drive_id uuid not null references public.drives(id) on delete cascade,
  source public.volunteer_source not null default 'manual',
  signed_up_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index volunteer_availability_unique on public.volunteer_availability (volunteer_id, drive_id);
create index volunteer_availability_drive_id_idx on public.volunteer_availability (drive_id);

-- Migration 10: Assignments table
create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  volunteer_id uuid not null references public.volunteers(id) on delete cascade,
  drive_id uuid not null references public.drives(id) on delete cascade,
  duty_id uuid not null references public.duties(id) on delete cascade,
  status public.assignment_status not null default 'assigned',
  assigned_by text,
  is_manual_override boolean not null default false,
  waitlist_position integer,
  confirmed_at timestamptz,
  checked_in_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  message_sent_override boolean,
  message_acknowledged_override boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.assignments.message_sent_override is 'Manual override: null = auto from communication_log, true/false = force value';
comment on column public.assignments.message_acknowledged_override is 'Manual override: null = auto from confirmed_at, true/false = force value';

create index assignments_drive_id_idx on public.assignments (drive_id);
create index assignments_volunteer_id_idx on public.assignments (volunteer_id);
create index assignments_duty_id_idx on public.assignments (duty_id);
create index assignments_status_idx on public.assignments (status);

create trigger handle_assignments_updated_at
  before update on public.assignments
  for each row
  execute function extensions.moddatetime(updated_at);
-- Migration 11: Communication Log table
create table public.communication_log (
  id uuid primary key default gen_random_uuid(),
  volunteer_id uuid not null references public.volunteers(id) on delete cascade,
  drive_id uuid references public.drives(id) on delete set null,
  channel public.comm_channel not null,
  direction text not null default 'outbound',
  content text,
  sent_at timestamptz,
  delivered_at timestamptz,
  response_received_at timestamptz,
  error text,
  call_id text,
  call_provider text,
  call_result public.call_result,
  call_duration_seconds integer,
  call_transcript jsonb,
  whatsapp_message_id text,
  created_at timestamptz not null default now()
);

create index communication_log_volunteer_id_idx on public.communication_log (volunteer_id);
create index communication_log_drive_id_idx on public.communication_log (drive_id);
-- Migration 12: WhatsApp Sessions table
create table public.whatsapp_sessions (
  id uuid primary key default gen_random_uuid(),
  phone_number text,
  status text not null default 'disconnected',
  qr_code text,
  season_group_jid text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger handle_whatsapp_sessions_updated_at
  before update on public.whatsapp_sessions
  for each row
  execute function extensions.moddatetime(updated_at);
-- Migration 13: App Config table (key-value settings)
create table public.app_config (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger handle_app_config_updated_at
  before update on public.app_config
  for each row
  execute function extensions.moddatetime(updated_at);
-- Migration 14: Reminder Schedules table
create table public.reminder_schedules (
  id uuid primary key default gen_random_uuid(),
  drive_id uuid not null references public.drives(id) on delete cascade,
  reminder_type text not null,
  hours_before_sunset numeric,
  message_template text,
  scheduled_at timestamptz,
  is_sent boolean not null default false,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index reminder_schedules_drive_id_idx on public.reminder_schedules (drive_id);
create index reminder_schedules_pending_idx on public.reminder_schedules (is_sent, scheduled_at) where is_sent = false;

create trigger handle_reminder_schedules_updated_at
  before update on public.reminder_schedules
  for each row
  execute function extensions.moddatetime(updated_at);
-- Migration 15: Scheduled Messages table
create table public.scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  drive_id uuid references public.drives(id) on delete set null,
  volunteer_id uuid references public.volunteers(id) on delete cascade,
  group_jid text,
  channel text not null default 'whatsapp',
  message text not null,
  scheduled_at timestamptz not null,
  sent_at timestamptz,
  status text not null default 'pending',
  error text,
  created_at timestamptz not null default now()
);

create index idx_scheduled_messages_pending
  on public.scheduled_messages (scheduled_at)
  where status = 'pending';

create index idx_scheduled_messages_drive
  on public.scheduled_messages (drive_id)
  where drive_id is not null;

comment on table public.scheduled_messages is 'Queue of scheduled WhatsApp messages to volunteers or groups';

-- Migration 16: Google Sheets Sync table
create table public.google_sheets_sync (
  id uuid primary key default gen_random_uuid(),
  sheet_id text not null,
  sheet_name text,
  last_synced_at timestamptz,
  last_synced_row integer not null default 0,
  sync_errors jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger handle_google_sheets_sync_updated_at
  before update on public.google_sheets_sync
  for each row
  execute function extensions.moddatetime(updated_at);
-- Migration 16.1: WhatsApp auth state tables
create table public.whatsapp_auth_creds (
  id text primary key default 'singleton',
  creds jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.whatsapp_auth_keys (
  type text not null,
  id text not null,
  value jsonb not null,
  primary key (type, id)
);

-- Migration 17: Database functions and triggers

-- Function: calculate_duty_capacity
-- Calculates volunteer capacity for a duty given a daig count
create or replace function public.calculate_duty_capacity(
  p_daig_count integer,
  p_duty_id uuid,
  p_mode public.capacity_mode default 'linear'
)
returns integer
language plpgsql
as $$
declare
  v_result integer := 0;
  v_rule record;
begin
  if p_mode = 'linear' then
    select base_count, per_daig_count
    into v_rule
    from public.duty_capacity_rules
    where duty_id = p_duty_id
      and capacity_mode = 'linear'
    limit 1;

    if found then
      v_result := coalesce(v_rule.base_count, 0) + ceil(coalesce(v_rule.per_daig_count, 0) * p_daig_count);
    end if;

  elsif p_mode = 'tiered' then
    select tier_capacity
    into v_rule
    from public.duty_capacity_rules
    where duty_id = p_duty_id
      and capacity_mode = 'tiered'
      and tier_min_daigs <= p_daig_count
      and (tier_max_daigs is null or tier_max_daigs >= p_daig_count)
    limit 1;

    if found then
      v_result := coalesce(v_rule.tier_capacity, 0);
    end if;
  end if;

  return v_result;
end;
$$;

-- Trigger function: update assigned count on drive_duties
create or replace function public.update_drive_duty_assigned_count()
returns trigger
language plpgsql
as $$
declare
  v_drive_id uuid;
  v_duty_id uuid;
begin
  -- Determine which drive_id and duty_id to update
  if TG_OP = 'DELETE' then
    v_drive_id := OLD.drive_id;
    v_duty_id := OLD.duty_id;
  else
    v_drive_id := NEW.drive_id;
    v_duty_id := NEW.duty_id;
  end if;

  -- Recalculate count (exclude waitlisted and cancelled statuses)
  update public.drive_duties
  set current_assigned = (
    select count(*)
    from public.assignments
    where drive_id = v_drive_id
      and duty_id = v_duty_id
      and status not in ('waitlisted', 'cancelled', 'no_show')
  )
  where drive_id = v_drive_id
    and duty_id = v_duty_id;

  -- Also update for the OLD duty if duty changed on UPDATE
  if TG_OP = 'UPDATE' and OLD.duty_id != NEW.duty_id then
    update public.drive_duties
    set current_assigned = (
      select count(*)
      from public.assignments
      where drive_id = OLD.drive_id
        and duty_id = OLD.duty_id
        and status not in ('waitlisted', 'cancelled', 'no_show')
    )
    where drive_id = OLD.drive_id
      and duty_id = OLD.duty_id;
  end if;

  return coalesce(NEW, OLD);
end;
$$;

-- Attach the trigger to assignments table
create trigger trg_update_drive_duty_assigned_count
  after insert or update or delete on public.assignments
  for each row
  execute function public.update_drive_duty_assigned_count();
-- Migration 18: Enable Row Level Security and create policies

-- Enable RLS on all tables
alter table public.seasons enable row level security;
alter table public.volunteers enable row level security;
alter table public.drives enable row level security;
alter table public.duties enable row level security;
alter table public.drive_duties enable row level security;
alter table public.duty_capacity_rules enable row level security;
alter table public.volunteer_availability enable row level security;
alter table public.assignments enable row level security;
alter table public.communication_log enable row level security;
alter table public.whatsapp_sessions enable row level security;
alter table public.app_config enable row level security;
alter table public.reminder_schedules enable row level security;
alter table public.google_sheets_sync enable row level security;
alter table public.whatsapp_auth_creds enable row level security;
alter table public.whatsapp_auth_keys enable row level security;

-- Policies: Authenticated users can read all data
-- Service role (admin) bypasses RLS entirely

-- Seasons: authenticated read, authenticated insert/update
create policy "Authenticated users can view seasons" on public.seasons for select to authenticated using (true);
create policy "Authenticated users can insert seasons" on public.seasons for insert to authenticated with check (true);
create policy "Authenticated users can update seasons" on public.seasons for update to authenticated using (true) with check (true);
create policy "Authenticated users can delete seasons" on public.seasons for delete to authenticated using (true);

-- Volunteers: authenticated read, authenticated insert/update; anon can insert (public registration)
create policy "Authenticated users can view volunteers" on public.volunteers for select to authenticated using (true);
create policy "Authenticated users can insert volunteers" on public.volunteers for insert to authenticated with check (true);
create policy "Authenticated users can update volunteers" on public.volunteers for update to authenticated using (true) with check (true);
create policy "Authenticated users can delete volunteers" on public.volunteers for delete to authenticated using (true);
create policy "Anon can insert volunteers" on public.volunteers for insert to anon with check (true);
create policy "Anon can view volunteers" on public.volunteers for select to anon using (true);

-- Drives: authenticated full access
create policy "Authenticated users can view drives" on public.drives for select to authenticated using (true);
create policy "Authenticated users can insert drives" on public.drives for insert to authenticated with check (true);
create policy "Authenticated users can update drives" on public.drives for update to authenticated using (true) with check (true);
create policy "Authenticated users can delete drives" on public.drives for delete to authenticated using (true);
create policy "Anon can view drives" on public.drives for select to anon using (true);

-- Duties: authenticated full access; anon read
create policy "Authenticated users can view duties" on public.duties for select to authenticated using (true);
create policy "Authenticated users can insert duties" on public.duties for insert to authenticated with check (true);
create policy "Authenticated users can update duties" on public.duties for update to authenticated using (true) with check (true);
create policy "Authenticated users can delete duties" on public.duties for delete to authenticated using (true);
create policy "Anon can view duties" on public.duties for select to anon using (true);

-- Drive Duties: authenticated full access; anon read
create policy "Authenticated users can view drive_duties" on public.drive_duties for select to authenticated using (true);
create policy "Authenticated users can insert drive_duties" on public.drive_duties for insert to authenticated with check (true);
create policy "Authenticated users can update drive_duties" on public.drive_duties for update to authenticated using (true) with check (true);
create policy "Authenticated users can delete drive_duties" on public.drive_duties for delete to authenticated using (true);
create policy "Anon can view drive_duties" on public.drive_duties for select to anon using (true);

-- Duty Capacity Rules: authenticated full access
create policy "Authenticated users can view duty_capacity_rules" on public.duty_capacity_rules for select to authenticated using (true);
create policy "Authenticated users can insert duty_capacity_rules" on public.duty_capacity_rules for insert to authenticated with check (true);
create policy "Authenticated users can update duty_capacity_rules" on public.duty_capacity_rules for update to authenticated using (true) with check (true);
create policy "Authenticated users can delete duty_capacity_rules" on public.duty_capacity_rules for delete to authenticated using (true);

-- Volunteer Availability: authenticated full access; anon can insert + select
create policy "Authenticated users can view volunteer_availability" on public.volunteer_availability for select to authenticated using (true);
create policy "Authenticated users can insert volunteer_availability" on public.volunteer_availability for insert to authenticated with check (true);
create policy "Authenticated users can update volunteer_availability" on public.volunteer_availability for update to authenticated using (true) with check (true);
create policy "Authenticated users can delete volunteer_availability" on public.volunteer_availability for delete to authenticated using (true);
create policy "Anon can insert volunteer_availability" on public.volunteer_availability for insert to anon with check (true);
create policy "Anon can view volunteer_availability" on public.volunteer_availability for select to anon using (true);

-- Assignments: authenticated full access; anon read
create policy "Authenticated users can view assignments" on public.assignments for select to authenticated using (true);
create policy "Authenticated users can insert assignments" on public.assignments for insert to authenticated with check (true);
create policy "Authenticated users can update assignments" on public.assignments for update to authenticated using (true) with check (true);
create policy "Authenticated users can delete assignments" on public.assignments for delete to authenticated using (true);
create policy "Anon can view assignments" on public.assignments for select to anon using (true);

-- Communication Log: authenticated full access
create policy "Authenticated users can view communication_log" on public.communication_log for select to authenticated using (true);
create policy "Authenticated users can insert communication_log" on public.communication_log for insert to authenticated with check (true);

-- WhatsApp Sessions: authenticated full access
create policy "Authenticated users can view whatsapp_sessions" on public.whatsapp_sessions for select to authenticated using (true);
create policy "Authenticated users can insert whatsapp_sessions" on public.whatsapp_sessions for insert to authenticated with check (true);
create policy "Authenticated users can update whatsapp_sessions" on public.whatsapp_sessions for update to authenticated using (true) with check (true);

-- WhatsApp auth state: authenticated full access
create policy "Authenticated users can manage whatsapp_auth_creds" on public.whatsapp_auth_creds for all to authenticated using (true) with check (true);
create policy "Authenticated users can manage whatsapp_auth_keys" on public.whatsapp_auth_keys for all to authenticated using (true) with check (true);

-- App Config: authenticated full access
create policy "Authenticated users can view app_config" on public.app_config for select to authenticated using (true);
create policy "Authenticated users can insert app_config" on public.app_config for insert to authenticated with check (true);
create policy "Authenticated users can update app_config" on public.app_config for update to authenticated using (true) with check (true);

-- Reminder Schedules: authenticated full access
create policy "Authenticated users can view reminder_schedules" on public.reminder_schedules for select to authenticated using (true);
create policy "Authenticated users can insert reminder_schedules" on public.reminder_schedules for insert to authenticated with check (true);
create policy "Authenticated users can update reminder_schedules" on public.reminder_schedules for update to authenticated using (true) with check (true);
create policy "Authenticated users can delete reminder_schedules" on public.reminder_schedules for delete to authenticated using (true);

-- Google Sheets Sync: authenticated full access
create policy "Authenticated users can view google_sheets_sync" on public.google_sheets_sync for select to authenticated using (true);
create policy "Authenticated users can insert google_sheets_sync" on public.google_sheets_sync for insert to authenticated with check (true);
create policy "Authenticated users can update google_sheets_sync" on public.google_sheets_sync for update to authenticated using (true) with check (true);
-- Migration 19: Enable Supabase Realtime on assignments table
alter publication supabase_realtime add table public.assignments;
-- Migration 20: Seed default duties, capacity rules, and app_config entries

-- Default duties
insert into public.duties (name, slug, display_order, gender_restriction, is_active) values
  ('Provider', 'provider', 1, null, true),
  ('Dari', 'dari', 2, null, true),
  ('Thaal', 'thaal', 3, null, true),
  ('Traffic', 'traffic', 4, 'male'::public.gender, true),
  ('Sherbet', 'sherbet', 5, null, true),
  ('Daig', 'daig', 6, 'male'::public.gender, true);

-- Default capacity rules (linear mode for each duty)
insert into public.duty_capacity_rules (duty_id, capacity_mode, base_count, per_daig_count)
select id, 'linear'::public.capacity_mode, 2, 1.5 from public.duties where slug = 'provider'
union all
select id, 'linear'::public.capacity_mode, 2, 1.0 from public.duties where slug = 'dari'
union all
select id, 'linear'::public.capacity_mode, 2, 1.0 from public.duties where slug = 'thaal'
union all
select id, 'linear'::public.capacity_mode, 1, 0.5 from public.duties where slug = 'traffic'
union all
select id, 'linear'::public.capacity_mode, 1, 0.5 from public.duties where slug = 'sherbet'
union all
select id, 'linear'::public.capacity_mode, 1, 0.5 from public.duties where slug = 'daig';

-- Traffic duty: also add tiered rules
insert into public.duty_capacity_rules (duty_id, capacity_mode, tier_min_daigs, tier_max_daigs, tier_capacity)
select id, 'tiered'::public.capacity_mode, 1, 5, 4 from public.duties where slug = 'traffic'
union all
select id, 'tiered'::public.capacity_mode, 6, 10, 8 from public.duties where slug = 'traffic'
union all
select id, 'tiered'::public.capacity_mode, 11, null, 12 from public.duties where slug = 'traffic';

-- Default app_config entries
insert into public.app_config (key, value, description) values
  ('assignment_rules', '{
    "history_lookback": "current_season",
    "waitlist_auto_fill": true,
    "male_priority_order": ["provider", "dari", "traffic", "daig", "thaal", "sherbet"],
    "female_priority_order": ["thaal", "female-provider", "female-dari", "provider", "dari", "sherbet"]
  }'::jsonb, 'Auto-assignment algorithm configuration'),
  ('ai_calling', '{
    "enabled": false,
    "provider": "retell",
    "retell_api_key": "",
    "retell_agent_id": "",
    "retell_from_number": "",
    "stagger_delay_ms": 2000,
    "auto_call_hours_before_sunset": 2
  }'::jsonb, 'Retell AI phone calling configuration'),
  ('whatsapp', '{
    "enabled": false,
    "confirm_keywords": ["confirm", "yes", "haan", "ji", "ha", "han"],
    "cancel_keywords": ["cancel", "no", "nahi", "nhi"],
    "rate_limit_per_second": 1,
    "rate_limit_burst": 5
  }'::jsonb, 'WhatsApp messaging configuration'),
  ('reminder_defaults', '{
    "reminders": [
      {
        "type": "first_reminder",
        "hours_before_sunset": 6,
        "template": "Assalam o Alaikum {name}! Reminder: You are assigned to {duty} for {drive_name} today at {location}. Sunset is at {sunset_time}. Please confirm by replying YES."
      },
      {
        "type": "second_reminder",
        "hours_before_sunset": 3,
        "template": "Reminder: {name}, please confirm your attendance for {duty} at {drive_name}. Sunset at {sunset_time}."
      },
      {
        "type": "final_reminder",
        "hours_before_sunset": 1.5,
        "template": "{name}, iftaar in 1.5 hours! Please head to {location} for your {duty} duty. JazakAllah Khair!"
      }
    ]
  }'::jsonb, 'Default reminder templates for new drives'),
  ('alerts', '{
    "notify_admins": true,
    "deficit_threshold_percent": 20
  }'::jsonb, 'Alert and notification thresholds'),
  ('signup_form_window', '{
    "mode": "next_n_days",
    "days": 7
  }'::jsonb, 'Volunteer sign-up form: which drives to show');
