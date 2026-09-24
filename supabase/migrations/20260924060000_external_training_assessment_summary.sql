-- Simple leader summary for Google Form training assessments
-- Returns only the latest test for each member: name, score, and result.

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
      order by q.submitted_at desc
    ),
    '[]'::jsonb
  )
  into result
  from (
    select distinct on (trim(e.membership_number))
      e.member_name,
      trim(e.membership_number) as membership_number,
      e.report,
      e.submitted_at,
      e.created_at
    from public.external_training_assessment_submissions e
    where trim(coalesce(e.membership_number,'')) <> ''
    order by trim(e.membership_number), e.submitted_at desc, e.created_at desc
  ) q;

  return result;
end;
$$;

revoke all on function public.get_external_training_assessment_summary(uuid) from public;
grant execute on function public.get_external_training_assessment_summary(uuid) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
