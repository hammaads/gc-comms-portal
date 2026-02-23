-- Backfill whatsapp_group_status for existing volunteers by inferring
-- from the content of their welcome DM in scheduled_messages.
--
-- Messages containing a chat.whatsapp.com link = invite_sent (group add failed)
-- Messages containing "added to the volunteer group" = added (group add succeeded)
-- Messages that were sent but match neither = added (default welcome without link)
-- Messages that failed = failed

-- 1. Volunteers whose welcome DM contains an invite link → invite_sent
update public.volunteers v
set whatsapp_group_status = 'invite_sent'
from public.scheduled_messages sm
where sm.volunteer_id = v.id
  and sm.drive_id is null
  and sm.message ilike '%chat.whatsapp.com%'
  and v.whatsapp_group_status is null;

-- 2. Volunteers whose welcome DM was sent but has no invite link → added
update public.volunteers v
set whatsapp_group_status = 'added'
from public.scheduled_messages sm
where sm.volunteer_id = v.id
  and sm.drive_id is null
  and sm.status = 'sent'
  and sm.message not ilike '%chat.whatsapp.com%'
  and v.whatsapp_group_status is null;

-- 3. Volunteers whose welcome DM failed → failed
update public.volunteers v
set whatsapp_group_status = 'failed'
from public.scheduled_messages sm
where sm.volunteer_id = v.id
  and sm.drive_id is null
  and sm.status = 'failed'
  and v.whatsapp_group_status is null;
