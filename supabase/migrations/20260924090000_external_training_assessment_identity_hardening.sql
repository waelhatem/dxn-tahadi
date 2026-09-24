-- Harden Google Form assessment identity handling.
-- Sponsor identity comes from Form ID on the Apps Script side.
-- Member identity comes from the submitted member number.
-- Normalize spaces and hyphens so historical/member-entered variants resolve
-- to the same membership key.

create index if not exists idx_external_training_assessment_membership_normalized
  on public.external_training_assessment_submissions (
    (regexp_replace(trim(membership_number), '[[:space:]-]+', '', 'g'))
  );

create or replace function public.get_external_training_assessment_summary(
  p_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  role_name text;
  result jsonb;
begin
  select au.role
    into role_name
  from public.sessions s
  join public.app_users au on au.id = s.user_id
  where s.token = p_token
    and s.expires_at > now()
    and au.active = true
  limit 1;

  if role_name is null then
    raise exception using errcode='P0001', message='جلسة الدخول غير صالحة أو منتهية';
  end if;

  if role_name <> 'leader' then
    raise exception using errcode='P0001', message='غير مصرح بعرض سجل اختبارات الأعضاء';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'member_name', q.member_name,
        'membership_number', q.membership_number,
        'score', coalesce(nullif(q.report->>'totalScore','')::integer, 0),
        'result', coalesce(q.report->>'overallStatus','retry')
      )
      order by q.submitted_at desc, q.created_at desc
    ),
    '[]'::jsonb
  )
  into result
  from (
    select distinct on (
      regexp_replace(trim(coalesce(e.membership_number,'')), '[[:space:]-]+', '', 'g')
    )
      e.member_name,
      regexp_replace(trim(e.membership_number), '[[:space:]-]+', '', 'g') as membership_number,
      e.report,
      e.submitted_at,
      e.created_at
    from public.external_training_assessment_submissions e
    where regexp_replace(trim(coalesce(e.membership_number,'')), '[[:space:]-]+', '', 'g') <> ''
    order by
      regexp_replace(trim(e.membership_number), '[[:space:]-]+', '', 'g'),
      e.submitted_at desc,
      e.created_at desc
  ) q;

  return result;
end;
$$;

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
  target_no text := nullif(
    regexp_replace(trim(coalesce(p_membership_number,'')), '[[:space:]-]+', '', 'g'),
    ''
  );
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

  if s.role = 'member'
     and regexp_replace(trim(coalesce(s.member_no,'')), '[[:space:]-]+', '', 'g') <> target_no then
    raise exception using errcode='P0001', message='غير مصرح بعرض سجل عضو آخر';
  end if;

  if not exists (
    select 1
    from public.members m
    where regexp_replace(trim(coalesce(m.member_no,'')), '[[:space:]-]+', '', 'g') = target_no
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
  where regexp_replace(trim(coalesce(e.membership_number,'')), '[[:space:]-]+', '', 'g') = target_no;

  return result;
end;
$$;

revoke all on function public.get_external_training_assessment_summary(uuid) from public;
grant execute on function public.get_external_training_assessment_summary(uuid) to anon, authenticated, service_role;

revoke all on function public.get_external_training_assessment_submissions(uuid, text) from public;
grant execute on function public.get_external_training_assessment_submissions(uuid, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
