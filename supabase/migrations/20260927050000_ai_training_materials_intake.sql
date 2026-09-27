-- ============================================================
-- AI Trainer — Training Materials Intake v1
-- Stage 1: receive and durably register leader training materials.
-- Processing/extraction is intentionally deferred to the next stage.
-- ============================================================

create table if not exists public.ai_training_materials (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  material_type text not null
    check (material_type in ('pdf','image','video')),
  mime_type text not null,
  original_filename text not null,
  storage_bucket text not null default 'ai-training-materials',
  storage_path text not null unique,
  file_size bigint,
  domain text not null default 'general',
  priority integer not null default 80
    check (priority between 0 and 100),
  status text not null default 'uploading'
    check (status in ('uploading','uploaded','processing','ready','failed','archived')),
  source text not null default 'leader_upload',
  uploaded_by uuid not null references public.app_users(id),
  metadata jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  uploaded_at timestamptz,
  processed_at timestamptz
);

create index if not exists ai_training_materials_status_idx
  on public.ai_training_materials(status, created_at desc);

create index if not exists ai_training_materials_domain_idx
  on public.ai_training_materials(domain, priority desc, created_at desc);

create index if not exists ai_training_materials_uploaded_by_idx
  on public.ai_training_materials(uploaded_by, created_at desc);

alter table public.ai_training_materials enable row level security;
revoke all on table public.ai_training_materials from public, anon, authenticated;

create or replace function public.create_ai_training_material(
  p_token uuid,
  p_title text,
  p_material_type text,
  p_mime_type text,
  p_original_filename text,
  p_storage_bucket text,
  p_storage_path text,
  p_file_size bigint default null,
  p_domain text default 'general',
  p_priority integer default 80,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  uid uuid;
  role_name text;
  material_id uuid;
begin
  select s.user_id, lower(u.role)
    into uid, role_name
  from public.sessions s
  join public.app_users u on u.id=s.user_id
  where s.token=p_token
    and s.expires_at>now()
    and u.active=true
  limit 1;

  if uid is null then
    raise exception 'انتهت الجلسة';
  end if;

  if role_name <> 'leader' then
    raise exception 'إضافة المواد التدريبية متاحة للقائد فقط';
  end if;

  if lower(trim(coalesce(p_material_type,''))) not in ('pdf','image','video') then
    raise exception 'نوع المادة غير مدعوم';
  end if;

  if nullif(trim(coalesce(p_title,'')),'') is null then
    raise exception 'عنوان المادة مطلوب';
  end if;

  if nullif(trim(coalesce(p_original_filename,'')),'') is null then
    raise exception 'اسم الملف مطلوب';
  end if;

  if nullif(trim(coalesce(p_storage_path,'')),'') is null then
    raise exception 'مسار التخزين مطلوب';
  end if;

  insert into public.ai_training_materials(
    title,
    material_type,
    mime_type,
    original_filename,
    storage_bucket,
    storage_path,
    file_size,
    domain,
    priority,
    status,
    uploaded_by,
    metadata
  )
  values(
    left(trim(p_title),300),
    lower(trim(p_material_type)),
    left(trim(p_mime_type),160),
    left(trim(p_original_filename),500),
    left(trim(coalesce(p_storage_bucket,'ai-training-materials')),120),
    left(trim(p_storage_path),1000),
    case when p_file_size is null then null else greatest(0,p_file_size) end,
    left(trim(coalesce(p_domain,'general')),120),
    greatest(0,least(coalesce(p_priority,80),100)),
    'uploading',
    uid,
    coalesce(p_metadata,'{}'::jsonb)
  )
  returning id into material_id;

  return material_id;
end;
$function$;

create or replace function public.complete_ai_training_material_upload(
  p_token uuid,
  p_material_id uuid,
  p_success boolean default true,
  p_error_message text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $function$
declare
  uid uuid;
  role_name text;
begin
  select s.user_id, lower(u.role)
    into uid, role_name
  from public.sessions s
  join public.app_users u on u.id=s.user_id
  where s.token=p_token
    and s.expires_at>now()
    and u.active=true
  limit 1;

  if uid is null then
    raise exception 'انتهت الجلسة';
  end if;

  if role_name <> 'leader' then
    raise exception 'إدارة المواد التدريبية متاحة للقائد فقط';
  end if;

  update public.ai_training_materials
  set
    status = case when coalesce(p_success,true) then 'uploaded' else 'failed' end,
    uploaded_at = case when coalesce(p_success,true) then now() else uploaded_at end,
    error_message = case
      when coalesce(p_success,true) then null
      else left(trim(coalesce(p_error_message,'فشل رفع المادة')),1000)
    end
  where id=p_material_id
    and uploaded_by=uid;

  if not found then
    raise exception 'المادة التدريبية غير موجودة أو غير مملوكة لهذا القائد';
  end if;

  return true;
end;
$function$;

create or replace function public.list_ai_training_materials(
  p_token uuid,
  p_limit integer default 50
)
returns table(
  id uuid,
  title text,
  material_type text,
  mime_type text,
  original_filename text,
  storage_bucket text,
  storage_path text,
  file_size bigint,
  domain text,
  priority integer,
  status text,
  metadata jsonb,
  error_message text,
  created_at timestamptz,
  uploaded_at timestamptz,
  processed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  uid uuid;
  role_name text;
  lim integer := greatest(1,least(coalesce(p_limit,50),200));
begin
  select s.user_id, lower(u.role)
    into uid, role_name
  from public.sessions s
  join public.app_users u on u.id=s.user_id
  where s.token=p_token
    and s.expires_at>now()
    and u.active=true
  limit 1;

  if uid is null then
    raise exception 'انتهت الجلسة';
  end if;

  if role_name <> 'leader' then
    raise exception 'عرض المواد التدريبية متاح للقائد فقط';
  end if;

  return query
  select
    m.id,m.title,m.material_type,m.mime_type,m.original_filename,
    m.storage_bucket,m.storage_path,m.file_size,m.domain,m.priority,
    m.status,m.metadata,m.error_message,m.created_at,m.uploaded_at,m.processed_at
  from public.ai_training_materials m
  where m.uploaded_by=uid
  order by m.created_at desc
  limit lim;
end;
$function$;

revoke all on function public.create_ai_training_material(
  uuid,text,text,text,text,text,text,bigint,text,integer,jsonb
) from public,anon,authenticated;

revoke all on function public.complete_ai_training_material_upload(
  uuid,uuid,boolean,text
) from public,anon,authenticated;

revoke all on function public.list_ai_training_materials(uuid,integer)
from public,anon,authenticated;

grant execute on function public.create_ai_training_material(
  uuid,text,text,text,text,text,text,bigint,text,integer,jsonb
) to service_role;

grant execute on function public.complete_ai_training_material_upload(
  uuid,uuid,boolean,text
) to service_role;

grant execute on function public.list_ai_training_materials(uuid,integer)
to service_role;

notify pgrst, 'reload schema';
