-- AI Trainer — secure processing access for training materials.
-- Processing runs server-side with service_role, but the table intentionally
-- has all direct API table privileges revoked. Use SECURITY DEFINER RPCs.

create or replace function public.get_ai_training_material_for_processing(
  p_token uuid,
  p_material_id uuid
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
  error_message text
)
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

  if uid is null or role_name <> 'leader' then
    raise exception 'معالجة المواد التدريبية متاحة للقائد فقط';
  end if;

  return query
  select
    m.id,m.title,m.material_type,m.mime_type,m.original_filename,
    m.storage_bucket,m.storage_path,m.file_size,m.domain,m.priority,
    m.status,m.metadata,m.error_message
  from public.ai_training_materials m
  where m.id=p_material_id
    and m.uploaded_by=uid
  limit 1;
end;
$function$;

create or replace function public.update_ai_training_material_processing(
  p_token uuid,
  p_material_id uuid,
  p_status text,
  p_error_message text default null,
  p_metadata jsonb default null,
  p_processed_at timestamptz default null
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

  if uid is null or role_name <> 'leader' then
    raise exception 'إدارة المواد التدريبية متاحة للقائد فقط';
  end if;

  if lower(trim(coalesce(p_status,''))) not in ('uploaded','processing','ready','failed','archived') then
    raise exception 'حالة المادة غير صالحة';
  end if;

  update public.ai_training_materials
  set
    status=lower(trim(p_status)),
    error_message=case
      when p_error_message is null then null
      else left(trim(p_error_message),1000)
    end,
    metadata=case
      when p_metadata is null then metadata
      else p_metadata
    end,
    processed_at=case
      when p_processed_at is null then processed_at
      else p_processed_at
    end
  where id=p_material_id
    and uploaded_by=uid;

  if not found then
    raise exception 'المادة التدريبية غير موجودة أو غير مملوكة لهذا القائد';
  end if;

  return true;
end;
$function$;

revoke all on function public.get_ai_training_material_for_processing(uuid,uuid)
from public,anon,authenticated;

revoke all on function public.update_ai_training_material_processing(uuid,uuid,text,text,jsonb,timestamptz)
from public,anon,authenticated;

grant execute on function public.get_ai_training_material_for_processing(uuid,uuid)
to service_role;

grant execute on function public.update_ai_training_material_processing(uuid,uuid,text,text,jsonb,timestamptz)
to service_role;

notify pgrst, 'reload schema';
