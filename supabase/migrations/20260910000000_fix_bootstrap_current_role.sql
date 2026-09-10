-- Fix login bootstrap role lookup
-- Avoid the PostgreSQL reserved CURRENT_ROLE name.

create or replace function public.app_current_role(p_token uuid)
returns text
language sql
security definer
set search_path = public
as $$
  select u.role
  from public.sessions s
  join public.app_users u on u.id = s.user_id
  where s.token = p_token
    and s.expires_at > now()
    and u.active;
$$;

revoke all on function public.app_current_role(uuid)
from public, anon, authenticated;

create or replace function public.bootstrap(p_token uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  r text;
  uid uuid;
  memberid uuid;
  mk text := to_char(current_date,'YYYY-MM');
begin
  r := public.app_current_role(p_token);
  uid := public.current_user_id(p_token);

  if r is null or uid is null then
    raise exception 'انتهت الجلسة';
  end if;

  if r = 'member' then
    select member_id
    into memberid
    from public.app_users
    where id = uid;
  end if;

  return json_build_object(
    'role', r,

    'teams',
    (
      select coalesce(
        json_agg(x order by x.name),
        '[]'::json
      )
      from public.team_stats x
    ),

    'members',
    (
      select coalesce(
        json_agg(x order by x.stars desc, x.name),
        '[]'::json
      )
      from public.member_stats x
      where r = 'leader' or x.id = memberid
    ),

    'challenges',
    (
      select coalesce(
        json_agg(c order by c.type, c.created_at),
        '[]'::json
      )
      from public.challenges c
      where c.active
    ),

    'questions',
    (
      select coalesce(
        json_agg(q order by q.question_no),
        '[]'::json
      )
      from public.monthly_questions q
      where q.month_key = mk
        and q.active
    ),

    'my_answers',
    (
      select coalesce(
        json_agg(a),
        '[]'::json
      )
      from public.question_answers a
      join public.monthly_questions q
        on q.id = a.question_id
      where q.month_key = mk
        and (r = 'leader' or a.member_id = memberid)
    ),

    'my_submissions',
    (
      select coalesce(
        json_agg(s),
        '[]'::json
      )
      from public.challenge_submissions s
      where r = 'leader' or s.member_id = memberid
    ),

    'monthly',
    (
      select coalesce(
        json_agg(mt),
        '[]'::json
      )
      from public.monthly_targets mt
      where r = 'leader' or mt.member_id = memberid
    )
  );
end
$$;
