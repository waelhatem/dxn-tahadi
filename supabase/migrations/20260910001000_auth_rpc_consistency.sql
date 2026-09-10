-- V85 auth RPC consistency hardening
-- Keep the existing data model; remove dependency on PostgreSQL CURRENT_ROLE
-- from application RPC authorization checks.

create or replace function public.app_current_user_id(p_token uuid)
returns uuid
language sql
security definer
set search_path = public
as $$
  select s.user_id
  from public.sessions s
  join public.app_users u on u.id = s.user_id
  where s.token = p_token
    and s.expires_at > now()
    and u.active;
$$;

revoke all on function public.app_current_user_id(uuid)
from public, anon, authenticated;

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

create or replace function public.current_user_id(p_token uuid)
returns uuid
language sql
security definer
set search_path = public
as $$
  select public.app_current_user_id(p_token);
$$;

create or replace function public.current_role(p_token uuid)
returns text
language sql
security definer
set search_path = public
as $$
  select public.app_current_role(p_token);
$$;

-- Revoke direct helper access; application callers use the public RPCs below.
revoke all on function public.current_user_id(uuid)
from public, anon, authenticated;
revoke all on function public.current_role(uuid)
from public, anon, authenticated;

create or replace function public.login(p_login_no text, p_pin text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  u public.app_users;
  s uuid;
  m public.members;
  t public.teams;
begin
  select * into u
  from public.app_users
  where login_no = trim(p_login_no)
    and active;

  if u.id is null or crypt(trim(coalesce(p_pin,'')), u.pin_hash) <> u.pin_hash then
    raise exception 'بيانات الدخول غير صحيحة';
  end if;

  insert into public.sessions(user_id)
  values (u.id)
  returning token into s;

  if u.member_id is not null then
    select * into m from public.members where id = u.member_id;
    if m.id is not null and m.team_id is not null then
      select * into t from public.teams where id = m.team_id;
    end if;
  end if;

  return json_build_object(
    'token', s,
    'role', u.role,
    'user_id', u.id,
    'member', case
      when m.id is null then null
      else json_build_object(
        'id', m.id,
        'member_no', m.member_no,
        'name', m.name,
        'team_id', m.team_id,
        'team_name', t.name,
        'stars', m.stars
      )
    end
  );
end;
$$;

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
  uid := public.app_current_user_id(p_token);
  r := public.app_current_role(p_token);

  if uid is null or r is null then
    raise exception 'انتهت الجلسة';
  end if;

  if r = 'member' then
    select member_id into memberid
    from public.app_users
    where id = uid and active;
  end if;

  return json_build_object(
    'role', r,
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

-- Public RPCs are callable by the browser; authorization is performed inside them.
grant execute on function public.login(text,text) to anon, authenticated;
grant execute on function public.bootstrap(uuid) to anon, authenticated;

-- All remaining application RPCs that use role checks should call app_current_role.
create or replace function public.submit_challenge(p_token uuid,p_challenge uuid,p_proof text)
returns uuid language plpgsql security definer set search_path=public as $$
declare uid uuid; mid uuid; c public.challenges; sid uuid;
begin
 uid:=public.app_current_user_id(p_token); if uid is null or public.app_current_role(p_token)<>'member' then raise exception 'غير مصرح'; end if;
 select member_id into mid from public.app_users where id=uid and active;
 select * into c from public.challenges where id=p_challenge and active;
 if c.id is null then raise exception 'التحدي غير متاح'; end if;
 if trim(coalesce(p_proof,''))='' then raise exception 'أدخل وصف الإنجاز'; end if;
 if exists(select 1 from public.challenge_submissions where member_id=mid and challenge_id=c.id and status='pending') then raise exception 'لديك إنجاز بانتظار اعتماد القائد'; end if;
 insert into public.challenge_submissions(member_id,challenge_id,proof,reward_stars) values(mid,c.id,trim(p_proof),c.stars) returning id into sid;
 return sid;
end; $$;

create or replace function public.submit_question(p_token uuid,p_question uuid,p_answer text)
returns uuid language plpgsql security definer set search_path=public as $$
declare uid uuid; mid uuid; q public.monthly_questions; aid uuid;
begin
 uid:=public.app_current_user_id(p_token); if uid is null or public.app_current_role(p_token)<>'member' then raise exception 'غير مصرح'; end if;
 select member_id into mid from public.app_users where id=uid and active;
 select * into q from public.monthly_questions where id=p_question and active and month_key=to_char(current_date,'YYYY-MM');
 if q.id is null then raise exception 'السؤال غير متاح'; end if;
 if trim(coalesce(p_answer,''))='' then raise exception 'اكتب الإجابة أولاً'; end if;
 if exists(select 1 from public.question_answers where member_id=mid and question_id=q.id) then raise exception 'أجبت عن هذا السؤال سابقاً'; end if;
 insert into public.question_answers(question_id,member_id,answer) values(q.id,mid,trim(p_answer)) returning id into aid;
 return aid;
end; $$;
