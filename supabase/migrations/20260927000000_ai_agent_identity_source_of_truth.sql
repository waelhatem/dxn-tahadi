-- Permanent AI-agent identity source of truth.
-- Never infer the current user from the first row of the team member list.

alter table public.app_users
  add column if not exists display_name text;

-- The existing built-in leader account represents the site owner/coach.
-- Keep this value in the account record instead of hard-coding it in chat logic.
update public.app_users
set display_name = 'وائل حاتم'
where login_no = 'LEADER'
  and (display_name is null or btrim(display_name) = '');

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
  current_member public.member_stats%rowtype;
  current_display_name text;
  mk text := to_char(current_date,'YYYY-MM');
begin
  uid := public.app_current_user_id(p_token);
  r := public.app_current_role(p_token);

  if uid is null or r is null then
    raise exception 'انتهت الجلسة';
  end if;

  select u.member_id, nullif(btrim(u.display_name),'')
    into memberid, current_display_name
  from public.app_users u
  where u.id = uid and u.active;

  if memberid is not null then
    select * into current_member
    from public.member_stats
    where id = memberid;
  end if;

  return json_build_object(
    'role', r,
    'user_id', uid,
    'current_user', json_build_object(
      'id', uid,
      'role', r,
      'display_name', current_display_name,
      'member', case
        when current_member.id is null then null
        else json_build_object(
          'id', current_member.id,
          'member_no', current_member.member_no,
          'name', current_member.name,
          'team_id', current_member.team_id,
          'team_name', current_member.team_name,
          'stars', current_member.stars
        )
      end
    ),
    'current_member', case
      when current_member.id is null then null
      else json_build_object(
        'id', current_member.id,
        'member_no', current_member.member_no,
        'name', current_member.name,
        'team_id', current_member.team_id,
        'team_name', current_member.team_name,
        'stars', current_member.stars
      )
    end,
    'teams', (select coalesce(json_agg(x order by x.name),'[]'::json) from public.team_stats x),
    'members', (select coalesce(json_agg(x order by x.stars desc,x.name),'[]'::json) from public.member_stats x where r='leader' or x.id=memberid),
    'challenges', (select coalesce(json_agg(c order by c.type,c.created_at),'[]'::json) from public.challenges c where c.active),
    'questions', (select coalesce(json_agg(q order by q.question_no),'[]'::json) from public.monthly_questions q where q.month_key=mk and q.active),
    'my_answers', (select coalesce(json_agg(a),'[]'::json) from public.question_answers a join public.monthly_questions q on q.id=a.question_id where q.month_key=mk and (r='leader' or a.member_id=memberid)),
    'my_submissions', (select coalesce(json_agg(s),'[]'::json) from public.challenge_submissions s where r='leader' or s.member_id=memberid),
    'monthly', (select coalesce(json_agg(mt),'[]'::json) from public.monthly_targets mt where r='leader' or mt.member_id=memberid)
  );
end;
$$;

grant execute on function public.bootstrap(uuid) to anon, authenticated;
