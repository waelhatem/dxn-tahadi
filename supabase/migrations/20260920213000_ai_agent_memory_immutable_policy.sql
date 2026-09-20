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
     or (
       f.scope='leader'
       and exists (
         select 1
         from public.app_users u
         where u.id=uid
           and u.role='leader'
           and u.active=true
       )
     )
     or (f.scope='member' and f.member_id=mid)
  order by f.created_at desc
  limit lim;
end;
$function$;

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



-- ============================================================
-- DXN member registry: preserve every version and forbid deletion.
-- Current registry may still be updated by the approved DXN sync flow;
-- every prior version is archived in permanent memory first.
-- ============================================================

create or replace function public.trg_archive_dxn_team_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if tg_op='DELETE' then
    raise exception using
      errcode='42501',
      message='سجل عضويات DXN لا يسمح بحذف العضوية. حدّث البيانات فقط من خلال المزامنة.';
  elsif tg_op='INSERT' then
    perform public.ai_agent_append_permanent_event(
      null,null,'created','dxn_team_member',new.member_no,to_jsonb(new)
    );
    return new;
  else
    perform public.ai_agent_append_permanent_event(
      null,null,'updated_before','dxn_team_member',old.member_no,to_jsonb(old)
    );
    perform public.ai_agent_append_permanent_event(
      null,null,'updated_after','dxn_team_member',new.member_no,to_jsonb(new)
    );
    return new;
  end if;
end;
$function$;

drop trigger if exists trg_archive_dxn_team_member
  on public.dxn_team_members;

create trigger trg_archive_dxn_team_member
before insert or update or delete
on public.dxn_team_members
for each row
execute function public.trg_archive_dxn_team_member();

-- Make the active AI message log append-only as well.
create or replace function public.prevent_ai_agent_message_mutation()
returns trigger
language plpgsql
as $function$
begin
  raise exception using
    errcode='42501',
    message='سجل محادثات المدرب محفوظ ولا يسمح بتعديل الرسائل أو حذفها.';
end;
$function$;

drop trigger if exists trg_ai_agent_message_immutable
  on public.ai_agent_messages;

create trigger trg_ai_agent_message_immutable
before update or delete
on public.ai_agent_messages
for each row
execute function public.prevent_ai_agent_message_mutation();

-- Learning patterns are historical findings. A newer pattern is a new row,
-- not an overwrite of an older learned pattern.
create or replace function public.prevent_ai_learning_pattern_mutation()
returns trigger
language plpgsql
as $function$
begin
  raise exception using
    errcode='42501',
    message='سجل التعلم محفوظ. أضف نمطًا تعليميًا أحدث بدل تعديل السجل القديم.';
end;
$function$;

drop trigger if exists trg_ai_learning_pattern_immutable
  on public.ai_agent_learning_patterns;

create trigger trg_ai_learning_pattern_immutable
before update or delete
on public.ai_agent_learning_patterns
for each row
execute function public.prevent_ai_learning_pattern_mutation();

create or replace function public.save_ai_agent_learning_pattern(
  p_token uuid,
  p_topic text default null,
  p_pattern text default null,
  p_evidence_summary text default null,
  p_working_lesson text default null,
  p_next_test text default null,
  p_evidence_count integer default 0,
  p_confidence numeric default null,
  p_status text default 'testing',
  p_source_event_ids uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  uid uuid;
  new_id uuid;
  st text := lower(trim(coalesce(p_status,'testing')));
  conf numeric := p_confidence;
  cnt integer := greatest(0,coalesce(p_evidence_count,0));
begin
  uid := public.current_user_id(p_token);
  if uid is null then
    raise exception 'انتهت الجلسة';
  end if;

  if st not in ('testing','supported','rejected','superseded') then
    st := 'testing';
  end if;

  if conf is not null then
    conf := greatest(0,least(1,conf));
  end if;

  if nullif(trim(coalesce(p_pattern,'')),'') is null
     and nullif(trim(coalesce(p_working_lesson,'')),'') is null then
    return null;
  end if;

  insert into public.ai_agent_learning_patterns(
    user_id,topic,pattern,evidence_summary,working_lesson,next_test,
    evidence_count,confidence,status,source_event_ids,updated_at
  )
  values(
    uid,
    nullif(left(trim(coalesce(p_topic,'')),500),''),
    nullif(left(trim(coalesce(p_pattern,'')),1200),''),
    nullif(left(trim(coalesce(p_evidence_summary,'')),1600),''),
    nullif(left(trim(coalesce(p_working_lesson,'')),1200),''),
    nullif(left(trim(coalesce(p_next_test,'')),1000),''),
    cnt,
    conf,
    st,
    coalesce(p_source_event_ids,'{}'),
    now()
  )
  returning id into new_id;

  return new_id;
end;
$function$;

notify pgrst, 'reload schema';
