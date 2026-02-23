alter table public.volunteers
  add column if not exists whatsapp_group_status text default null;

comment on column public.volunteers.whatsapp_group_status is
  'Result of WhatsApp group-add attempt: added | invite_sent | failed | null (not attempted)';
