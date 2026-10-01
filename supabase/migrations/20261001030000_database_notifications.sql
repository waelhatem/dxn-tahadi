-- Durable, database-backed notifications.
-- Existing historical achievements are intentionally NOT backfilled as notifications.
-- Only new events after this migration create notification rows.

create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references public.app_users(id) on delete cascade,
  recipient_member_id uuid references public.members(id) on delete cascade,
  event_type text not null,
  source_id uuid,
  icon text not null default '🔔',
  title text not null,
  body text not null,
  action_tab text,
  action_label text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint app_notifications_event_type_chk check (char_length(trim(event_type)) > 0)
);

create index if not exists app_notifications_recipient_unread_idx
  on public.app_notifications(recipient_user_id, read_at, created_at desc);

create unique index if not exists app_notifications_event_unique_idx
  on public.app_notifications(recipient_user_id, event_type, source_id);

alter table public.app_notifications enable row level security;
revoke all on table public.app_notifications from public, anon, authenticated;

create or replace function public.create_member_notification(
  p_member_id uuid,
  p_event_type text,
  p_source_id uuid,
  p_icon text,
  p_title text,
  p_body text,
  p_action_tab text default null,
  p_action_label text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid;
  notification_id uuid;
begin
  select u.id
    into target_user_id
  from public.app_users u
  where u.member_id = p_member_id
    and u.role = 'member'
    and u.active = true
  order by u.created_at desc nulls last
  limit 1;

  if target_user_id is null then
    return null;
  end if;

  insert into public.app_notifications(
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
  values(
    target_user_id,
    p_member_id,
    trim(p_event_type),
    p_source_id,
    coalesce(nullif(trim(p_icon), ''), '🔔'),
    trim(p_title),
    trim(p_body),
    nullif(trim(p_action_tab), ''),
    nullif(trim(p_action_label), '')
  )
  on conflict (recipient_user_id, event_type, source_id)
  do nothing
  returning id into notification_id;

  return notification_id;
end;
$$;

revoke all on function public.create_member_notification(uuid,text,uuid,text,text,text,text,text)
from public, anon, authenticated;

create or replace function public.list_notifications(p_token uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  result json;
begin
  uid := public.app_current_user_id(p_token);

  if uid is null then
    raise exception 'انتهت الجلسة';
  end if;

  select coalesce(
    json_agg(
      json_build_object(
        'id', n.id,
        'event_type', n.event_type,
        'source_id', n.source_id,
        'icon', n.icon,
        'title', n.title,
        'desc', n.body,
        'action_tab', n.action_tab,
        'action_label', n.action_label,
        'created_at', n.created_at,
        'read_at', n.read_at
      )
      order by n.created_at desc
    ),
    '[]'::json
  )
  into result
  from public.app_notifications n
  where n.recipient_user_id = uid
    and n.read_at is null;

  return result;
end;
$$;

revoke all on function public.list_notifications(uuid)
from public, anon, authenticated;

grant execute on function public.list_notifications(uuid)
to anon, authenticated;

create or replace function public.mark_notifications_read(
  p_token uuid,
  p_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  changed integer;
begin
  uid := public.app_current_user_id(p_token);

  if uid is null then
    raise exception 'انتهت الجلسة';
  end if;

  update public.app_notifications
  set read_at = coalesce(read_at, now())
  where recipient_user_id = uid
    and id = any(coalesce(p_ids, '{}'::uuid[]))
    and read_at is null;

  get diagnostics changed = row_count;
  return changed;
end;
$$;

revoke all on function public.mark_notifications_read(uuid,uuid[])
from public, anon, authenticated;

grant execute on function public.mark_notifications_read(uuid,uuid[])
to anon, authenticated;

create or replace function public.mark_all_notifications_read(p_token uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  changed integer;
begin
  uid := public.app_current_user_id(p_token);

  if uid is null then
    raise exception 'انتهت الجلسة';
  end if;

  update public.app_notifications
  set read_at = coalesce(read_at, now())
  where recipient_user_id = uid
    and read_at is null;

  get diagnostics changed = row_count;
  return changed;
end;
$$;

revoke all on function public.mark_all_notifications_read(uuid)
from public, anon, authenticated;

grant execute on function public.mark_all_notifications_read(uuid)
to anon, authenticated;

create or replace function public.notify_challenge_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  challenge_title text;
  notification_icon text;
  notification_title text;
  notification_body text;
  notification_event text;
  action_tab text;
  action_label text;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' then
      return new;
    end if;
    notification_event := 'challenge_submission_pending';
    notification_icon := '⏳';
    notification_title := 'إنجازك بانتظار اعتماد القائد';
    notification_body := 'تم إرسال إنجازك للمراجعة. انتظر قرار القائد قبل إعادة المهمة نفسها.';
    action_tab := 'ch';
    action_label := 'عرض التحديات';
  elsif tg_op = 'UPDATE' then
    if new.status is not distinct from old.status then
      return new;
    end if;

    if new.status = 'approved' then
      notification_event := 'challenge_submission_approved';
      notification_icon := '✅';
      notification_title := 'تم اعتماد إنجازك';
      action_tab := 'progress';
      action_label := 'عرض تقدّمي';
    elsif new.status = 'rejected' then
      notification_event := 'challenge_submission_rejected';
      notification_icon := '❌';
      notification_title := 'تم رفض إنجازك';
      action_tab := 'ch';
      action_label := 'إعادة المحاولة';
    else
      return new;
    end if;

    notification_body := case
      when new.status = 'approved'
        then 'تم اعتماد إنجازك وإضافة المكافأة المستحقة إلى رصيدك.'
      else 'تم رفض الإنجاز. راجع الإثبات وأعد المحاولة عند إتاحة المهمة.'
    end;
  else
    return new;
  end if;

  select c.title into challenge_title
  from public.challenges c
  where c.id = new.challenge_id;

  if challenge_title is not null then
    notification_body := case
      when new.status = 'pending'
        then format('«%s» أرسلته للمراجعة. انتظر قرار القائد.', challenge_title)
      when new.status = 'approved'
        then format('تم اعتماد «%s» وإضافة المكافأة المستحقة إلى رصيدك.', challenge_title)
      else
        format('تم رفض «%s». راجع الإثبات وأعد المحاولة عند إتاحة المهمة.', challenge_title)
    end;
  end if;

  perform public.create_member_notification(
    new.member_id,
    notification_event,
    new.id,
    notification_icon,
    notification_title,
    notification_body,
    action_tab,
    action_label
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_challenge_submission on public.challenge_submissions;
create trigger trg_notify_challenge_submission
after insert or update of status on public.challenge_submissions
for each row execute function public.notify_challenge_submission();

create or replace function public.notify_question_answer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  notification_event text;
  notification_icon text;
  notification_title text;
  notification_body text;
  action_label text;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' then
      return new;
    end if;
    notification_event := 'question_answer_pending';
    notification_icon := '⏳';
    notification_title := 'إجابتك بانتظار المراجعة';
    notification_body := 'تم إرسال إجابتك للمراجعة.';
    action_label := 'عرض الأسئلة';
  elsif tg_op = 'UPDATE' then
    if new.status is not distinct from old.status then
      return new;
    end if;

    if new.status = 'approved' then
      notification_event := 'question_answer_approved';
      notification_icon := '✅';
      notification_title := 'تم اعتماد إجابتك';
      notification_body := 'تم اعتماد إجابتك عن السؤال الشهري وحصلت على المكافأة المستحقة.';
      action_label := 'عرض الأسئلة';
    elsif new.status = 'rejected' then
      notification_event := 'question_answer_rejected';
      notification_icon := '❌';
      notification_title := 'تحتاج إجابتك إلى مراجعة';
      notification_body := 'لم تتم الموافقة على إجابتك عن السؤال الشهري. يمكنك مراجعتها والمحاولة مجددًا عند الإتاحة.';
      action_label := 'عرض الأسئلة';
    else
      return new;
    end if;
  else
    return new;
  end if;

  perform public.create_member_notification(
    new.member_id,
    notification_event,
    new.id,
    notification_icon,
    notification_title,
    notification_body,
    'ch',
    action_label
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_question_answer on public.question_answers;
create trigger trg_notify_question_answer
after insert or update of status on public.question_answers
for each row execute function public.notify_question_answer();

notify pgrst, 'reload schema';
