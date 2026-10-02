-- Fix challenge approval notifications.
-- Pending challenge submissions are approval work for leaders only.
-- Approved/rejected outcomes continue to notify the submitting member.

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
    notification_title := 'إنجاز جديد بانتظار اعتمادك';
    notification_body := 'يوجد إنجاز تحدٍّ جديد بانتظار مراجعتك واعتمادك من لوحة القائد.';
    action_tab := 'leader';
    action_label := 'فتح لوحة القائد';

    select c.title
      into challenge_title
    from public.challenges c
    where c.id = new.challenge_id;

    if challenge_title is not null then
      notification_body := format(
        '«%s» أرسله عضو بانتظار مراجعتك واعتماده من لوحة القائد.',
        challenge_title
      );
    end if;

    -- Pending approval work belongs only to active leader accounts.
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
    select
      au.id,
      au.member_id,
      notification_event,
      new.id,
      notification_icon,
      notification_title,
      notification_body,
      action_tab,
      action_label
    from public.app_users au
    where au.role = 'leader'
      and au.active = true
    on conflict (recipient_user_id, event_type, source_id) do nothing;

    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.status is not distinct from old.status then
      return new;
    end if;

    if new.status = 'approved' then
      notification_event := 'challenge_submission_approved';
      notification_icon := '✅';
      notification_title := 'تم اعتماد إنجازك';
      notification_body := 'تم اعتماد إنجازك وإضافة المكافأة المستحقة إلى رصيدك.';
      action_tab := 'progress';
      action_label := 'عرض تقدّمي';
    elsif new.status = 'rejected' then
      notification_event := 'challenge_submission_rejected';
      notification_icon := '❌';
      notification_title := 'تم رفض إنجازك';
      notification_body := 'تم رفض الإنجاز. راجع الإثبات وأعد المحاولة عند إتاحة المهمة.';
      action_tab := 'ch';
      action_label := 'إعادة المحاولة';
    else
      return new;
    end if;

    select c.title
      into challenge_title
    from public.challenges c
    where c.id = new.challenge_id;

    if challenge_title is not null then
      notification_body := case
        when new.status = 'approved'
          then format(
            'تم اعتماد «%s» وإضافة المكافأة المستحقة إلى رصيدك.',
            challenge_title
          )
        else format(
          'تم رفض «%s». راجع الإثبات وأعد المحاولة عند إتاحة المهمة.',
          challenge_title
        )
      end;
    end if;

    -- Outcome notifications go only to the member who submitted the challenge.
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
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_challenge_submission
  on public.challenge_submissions;

create trigger trg_notify_challenge_submission
after insert or update of status on public.challenge_submissions
for each row
execute function public.notify_challenge_submission();

-- Hide previously-created incorrect "pending approval" member notifications
-- without deleting notification history.
update public.app_notifications n
set read_at = coalesce(n.read_at, now())
where n.event_type = 'challenge_submission_pending'
  and exists (
    select 1
    from public.app_users au
    where au.id = n.recipient_user_id
      and au.role = 'member'
  )
  and exists (
    select 1
    from public.challenge_submissions cs
    where cs.id = n.source_id
      and cs.status = 'pending'
  );

notify pgrst, 'reload schema';
