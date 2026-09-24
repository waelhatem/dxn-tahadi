-- External Google Form assessment history lookup for member profiles
-- Uses the application's session token for authorization and membership_number as the fixed key.

create or replace function public.get_external_training_assessment_submissions(
  p_token uuid,
  p_membership_number text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  target_no text := nullif(trim(coalesce(p_membership_number, '')), '');
  result jsonb;
begin
  select au.id as user_id, au.role, au.member_id, m.member_no
    into s
  from public.sessions ss
  join public.app_users au on au.id = ss.user_id
  left join public.members m on m.id = au.member_id
  where ss.token = p_token
    and ss.expires_at > now()
    and au.active = true
  limit 1;

  if not found then
    raise exception using errcode='P0001', message='جلسة الدخول غير صالحة أو منتهية';
  end if;

  if target_no is null then
    raise exception using errcode='P0001', message='رقم العضوية غير موجود';
  end if;

  if s.role = 'member' and coalesce(trim(s.member_no), '') <> target_no then
    raise exception using errcode='P0001', message='غير مصرح بعرض سجل عضو آخر';
  end if;

  if not exists (
    select 1
    from public.members m
    where trim(coalesce(m.member_no, '')) = target_no
  ) then
    raise exception using errcode='P0001', message='العضو المطلوب غير موجود';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'form_id', e.form_id,
        'sponsor_email', e.sponsor_email,
        'member_name', e.member_name,
        'membership_number', e.membership_number,
        'submitted_at', e.submitted_at,
        'answers', e.answers,
        'report', e.report,
        'created_at', e.created_at
      )
      order by e.submitted_at desc, e.created_at desc
    ),
    '[]'::jsonb
  )
  into result
  from public.external_training_assessment_submissions e
  where trim(e.membership_number) = target_no;

  return result;
end;
$$;

revoke all on function public.get_external_training_assessment_submissions(uuid, text) from public;
grant execute on function public.get_external_training_assessment_submissions(uuid, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
