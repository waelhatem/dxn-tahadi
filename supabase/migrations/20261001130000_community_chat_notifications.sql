-- Notify members when a new community chat message is created.
-- Historical chat messages are not backfilled.

create or replace function public.notify_community_chat_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.app_notifications (
    recipient_user_id,
    recipient_member_id,
    event_type,
    source_id,
    icon,
    title,
    body,
    action_tab,
    action_label
  )
  select
    u.id,
    u.member_id,
    'community_chat_message',
    new.id,
    '💬',
    'رسالة جديدة في المجتمع',
    format('أرسل %s رسالة جديدة في محادثة المجتمع.', coalesce(nullif(trim(new.sender_name), ''), 'أحد أعضاء المجتمع')),
    'community',
    'فتح المحادثة'
  from public.app_users u
  where u.role = 'member'
    and u.active = true
    and (
      nullif(trim(new.sender_member_no), '') is null
      or coalesce(trim(u.login_no), '') <> trim(new.sender_member_no)
    );

  return new;
end;
$$;

revoke all on function public.notify_community_chat_message()
from public, anon, authenticated;

drop trigger if exists trg_notify_community_chat_message
on public.community_chat_messages;

create trigger trg_notify_community_chat_message
after insert on public.community_chat_messages
for each row
execute function public.notify_community_chat_message();

notify pgrst, 'reload schema';
