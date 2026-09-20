-- ============================================================
-- Permanent memory policy hardening
-- 1) Permanent records are append-only: UPDATE/DELETE are blocked.
-- 2) Browser roles cannot write to permanent memory.
-- 3) The coach backend (service_role) is the only application writer.
-- 4) Corrections are appended as new records; old records remain intact.
-- ============================================================

-- Append-only protection for the permanent event archive.
create or replace function public.prevent_permanent_memory_mutation()
returns trigger
language plpgsql
as $function$
begin
  raise exception using
    errcode='42501',
    message='الذاكرة الدائمة للمدرب غير قابلة للتعديل أو الحذف. أضف معلومة جديدة أو تصحيحًا كسجل جديد.';
end;
$function$;

drop trigger if exists trg_permanent_memory_immutable
  on public.ai_agent_permanent_memory_events;

create trigger trg_permanent_memory_immutable
before update or delete
on public.ai_agent_permanent_memory_events
for each row
execute function public.prevent_permanent_memory_mutation();

-- Only the server-side coach may read the full permanent archive.
revoke all on function public.get_ai_agent_permanent_memory(uuid,integer)
from public, anon, authenticated;

grant execute on function public.get_ai_agent_permanent_memory(uuid,integer)
to service_role;

-- Only the server-side coach may create permanent snapshots.
revoke all on function public.save_ai_agent_context_snapshot(uuid,jsonb)
from public, anon, authenticated;

grant execute on function public.save_ai_agent_context_snapshot(uuid,jsonb)
to service_role;


-- ============================================================
-- Durable learned facts
-- These are append-only. A newer fact never edits an older fact.
-- ============================================================

create table if not exists public.ai_agent_learned_facts (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'member'
    check (scope in ('global','leader','member')),
  user_id uuid,
  member_id uuid,
  fact text not null,
  source text not null default 'conversation',
  source_entity_type text,
  source_entity_id text,
  supersedes_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists ai_agent_learned_facts_scope_idx
  on public.ai_agent_learned_facts(scope, created_at desc);

create index if not exists ai_agent_learned_facts_user_idx
  on public.ai_agent_learned_facts(user_id, created_at desc);

create index if not exists ai_agent_learned_facts_member_idx
  on public.ai_agent_learned_facts(member_id, created_at desc);

alter table public.ai_agent_learned_facts enable row level security;

create or replace function public.prevent_learned_fact_mutation()
returns trigger
language plpgsql
as $function$
begin
  raise exception using
    errcode='42501',
    message='معلومة التعلم الدائمة غير قابلة للتعديل أو الحذف. أضف نسخة أحدث بدل تعديل السجل القديم.';
end;
$function$;

drop trigger if exists trg_learned_fact_immutable
  on public.ai_agent_learned_facts;

create trigger trg_learned_fact_immutable
before update or delete
on public.ai_agent_learned_facts
for each row
execute function public.prevent_learned_fact_mutation();

create or replace function public.append_ai_agent_learned_fact(
  p_token uuid,
  p_scope text,
  p_fact text,
  p_source text default 'conversation',
  p_source_entity_type text default null,
  p_source_entity_id text default null,
  p_supersedes_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  uid uuid;
  mid uuid;
  role_name text;
  new_id uuid;
  sc text := lower(trim(coalesce(p_scope,'member')));
begin
  select s.user_id,u.member_id,lower(u.role)
    into uid,mid,role_name
  from public.sessions s
  join public.app_users u on u.id=s.user_id
  where s.token=p_token
    and s.expires_at>now()
    and u.active=true
  limit 1;

  if uid is null then
    raise exception 'انتهت الجلسة';
  end if;

  if sc not in ('global','leader','member') then
    sc := 'member';
  end if;

  if sc='global' and role_name<>'leader' then
    raise exception 'المعرفة العامة للمدرب لا يضيفها إلا المسار المصرح له';
  end if;

  if nullif(trim(coalesce(p_fact,'')),'') is null then
    raise exception 'محتوى التعلم فارغ';
  end if;

  insert into public.ai_agent_learned_facts(
    scope,user_id,member_id,fact,source,
    source_entity_type,source_entity_id,supersedes_id
  )
  values(
    sc,
    uid,
    case when sc='member' then mid else null end,
    left(trim(p_fact),4000),
    left(trim(coalesce(p_source,'conversation')),100),
    nullif(left(trim(coalesce(p_source_entity_type,'')),100),''),
    nullif(left(trim(coalesce(p_source_entity_id,'')),200),''),
    p_supersedes_id
  )
  returning id into new_id;

  return new_id;
end;
$function$;

revoke all on function public.append_ai_agent_learned_fact(
  uuid,text,text,text,text,text,uuid
) from public,anon,authenticated;

grant execute on function public.append_ai_agent_learned_fact(
  uuid,text,text,text,text,text,uuid
) to service_role;


create or replace function public.get_ai_agent_learned_facts(
  p_token uuid,
  p_limit integer default 120
)
returns table(
  id uuid,
  scope text,
  fact text,
  source text,
  source_entity_type text,
  source_entity_id text,
  supersedes_id uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  uid uuid;
  mid uuid;
  lim integer := greatest(1,least(coalesce(p_limit,120),500));
begin
  select s.user_id,u.member_id
    into uid,mid
  from public.sessions s
  join public.app_users u on u.id=s.user_id
  where s.token=p_token
    and s.expires_at>now()
    and u.active=true
  limit 1;

  if uid is null then
    raise exception 'انتهت الجلسة';
  end if;

  return query
  select
    f.id,
    f.scope,
    f.fact,
    f.source,
    f.source_entity_type,
    f.source_entity_id,
    f.supersedes_id,
    f.created_at
  from public.ai_agent_learned_facts f
  where f.scope='global'
     or (f.scope='leader' and role_name_for_user(uid)='leader')
     or (f.scope='member' and f.member_id=mid)
  order by f.created_at desc
  limit lim;
end;
$function$;

-- Helper is intentionally avoided here; use the app_users row directly for role.
drop function if exists public.role_name_for_user(uuid);

revoke all on function public.get_ai_agent_learned_facts(uuid,integer)
from public,anon,authenticated;

grant execute on function public.get_ai_agent_learned_facts(uuid,integer)
to service_role;

-- Existing curated knowledge becomes append-only as well.
create or replace function public.prevent_knowledge_mutation()
returns trigger
language plpgsql
as $function$
begin
  raise exception using
    errcode='42501',
    message='معرفة المدرب الدائمة غير قابلة للتعديل أو الحذف. أضف معلومة أحدث كسجل جديد.';
end;
$function$;

drop trigger if exists trg_ai_agent_knowledge_immutable
  on public.ai_agent_knowledge;

create trigger trg_ai_agent_knowledge_immutable
before update or delete
on public.ai_agent_knowledge
for each row
execute function public.prevent_knowledge_mutation();

revoke all on function public.get_ai_agent_knowledge(uuid,integer)
from public,anon,authenticated;

grant execute on function public.get_ai_agent_knowledge(uuid,integer)
to service_role;

revoke all on function public.save_ai_agent_knowledge(
  uuid,text,text,text,text,integer,boolean
) from public,anon,authenticated;

grant execute on function public.save_ai_agent_knowledge(
  uuid,text,text,text,text,integer,boolean
) to service_role;

notify pgrst, 'reload schema';
