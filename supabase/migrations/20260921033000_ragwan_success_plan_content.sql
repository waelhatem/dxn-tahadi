-- ============================================================
-- Ragwan Success Plan content blocks
-- Text + images, leader-managed, visible to all authenticated users.
-- ============================================================

create table if not exists public.ragwan_success_plan_content (
  id uuid primary key default gen_random_uuid(),
  content_type text not null check (content_type in ('text','image')),
  text_content text,
  image_data text,
  created_by uuid not null references public.app_users(id),
  created_at timestamptz not null default now(),
  constraint ragwan_content_payload_check check (
    (content_type='text' and nullif(trim(coalesce(text_content,'')),'') is not null and image_data is null)
    or
    (content_type='image' and image_data is not null and text_content is null)
  )
);

create index if not exists idx_ragwan_success_plan_content_created
on public.ragwan_success_plan_content(created_at);

alter table public.ragwan_success_plan_content enable row level security;
revoke all on public.ragwan_success_plan_content from public, anon, authenticated;

create or replace function public.get_ragwan_success_plan_content(p_token uuid)
returns json
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid;
begin
  uid:=public.app_current_user_id(p_token);
  if uid is null then raise exception 'انتهت الجلسة'; end if;

  return coalesce(
    (select json_agg(
      json_build_object(
        'id',id,
        'content_type',content_type,
        'text_content',text_content,
        'image_data',image_data,
        'created_at',created_at
      ) order by created_at,id
    ) from public.ragwan_success_plan_content),
    '[]'::json
  );
end;
$$;

create or replace function public.save_ragwan_success_plan_content(
  p_token uuid,
  p_content_type text,
  p_text_content text default null,
  p_image_data text default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid;
  cid uuid;
begin
  uid:=public.app_current_user_id(p_token);
  if uid is null or public.app_current_role(p_token)<>'leader' then
    raise exception 'غير مصرح — إضافة محتوى الخطة متاحة للقائد فقط';
  end if;

  if p_content_type not in ('text','image') then
    raise exception 'نوع المحتوى غير صالح';
  end if;

  if p_content_type='text' then
    if nullif(trim(coalesce(p_text_content,'')),'') is null then
      raise exception 'اكتب المحتوى أولاً';
    end if;
    insert into public.ragwan_success_plan_content(content_type,text_content,created_by)
    values('text',trim(p_text_content),uid)
    returning id into cid;
  else
    if p_image_data is null or length(p_image_data)<100 then
      raise exception 'اختر صورة أولاً';
    end if;
    if length(p_image_data)>2500000 then
      raise exception 'حجم الصورة بعد الضغط كبير جدًا';
    end if;
    insert into public.ragwan_success_plan_content(content_type,image_data,created_by)
    values('image',p_image_data,uid)
    returning id into cid;
  end if;

  return cid;
end;
$$;

grant execute on function public.get_ragwan_success_plan_content(uuid) to anon, authenticated;
grant execute on function public.save_ragwan_success_plan_content(uuid,text,text,text) to anon, authenticated;

notify pgrst,'reload schema';
