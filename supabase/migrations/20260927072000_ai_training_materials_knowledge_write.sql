-- Securely persist extracted training knowledge without exposing ai_agent_knowledge to REST.
create or replace function public.save_ai_training_material_knowledge(
  p_token uuid,
  p_material_id uuid,
  p_category text,
  p_title_prefix text,
  p_priority integer,
  p_chunks jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  role_name text;
  source_prefix text := 'uploaded_material:' || p_material_id::text;
  saved_count integer := 0;
begin
  select lower(u.role)
    into role_name
  from public.sessions s
  join public.app_users u on u.id=s.user_id
  where s.token=p_token
    and s.expires_at>now()
    and u.active=true
  limit 1;

  if role_name <> 'leader' then
    raise exception 'هذه العملية متاحة للقائد فقط';
  end if;

  if jsonb_typeof(coalesce(p_chunks,'[]'::jsonb)) <> 'array' then
    raise exception 'بيانات المعرفة المستخرجة غير صالحة';
  end if;

  delete from public.ai_agent_knowledge
  where source like source_prefix || '%';

  insert into public.ai_agent_knowledge(
    scope, category, title, content, priority, active, source, updated_at
  )
  select
    'global',
    left(trim(coalesce(p_category,'uploaded_training')),120),
    left(trim(coalesce(p_title_prefix,'مادة تدريبية')) || ' — ' || trim(coalesce(item->>'title','قسم')),300),
    left(trim(coalesce(item->>'content','')),4000),
    greatest(0,least(coalesce(p_priority,80),100)),
    true,
    source_prefix || case
      when lower(trim(coalesce(p_category,'')))='dxn_pdf_source_exact'
        then ':uploaded_pdf_exact'
      else ':uploaded_image_exact'
    end,
    now()
  from jsonb_array_elements(p_chunks) as item
  where nullif(trim(coalesce(item->>'content','')),'') is not null;

  get diagnostics saved_count = row_count;
  return saved_count;
end;
$function$;

revoke all on function public.save_ai_training_material_knowledge(uuid,uuid,text,text,integer,jsonb)
  from public, anon, authenticated;

grant execute on function public.save_ai_training_material_knowledge(uuid,uuid,text,text,integer,jsonb)
  to service_role;

notify pgrst, 'reload schema';
