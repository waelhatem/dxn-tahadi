-- Global announcements are intentionally separate from the existing notification system.
-- They are broadcast messages created by leaders and acknowledged by members.

create table if not exists public.global_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  announcement_type text not null default 'announcement'
    check (announcement_type in ('important','warning','announcement')),
  active boolean not null default true,
  created_by_user_id uuid not null references public.app_users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists global_announcements_active_idx
  on public.global_announcements(active, created_at desc);

create table if not exists public.global_announcement_reads (
  announcement_id uuid not null references public.global_announcements(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

create index if not exists global_announcement_reads_user_idx
  on public.global_announcement_reads(user_id, acknowledged_at desc);

alter table public.global_announcements enable row level security;
alter table public.global_announcement_reads enable row level security;
revoke all on table public.global_announcements from public, anon, authenticated;
revoke all on table public.global_announcement_reads from public, anon, authenticated;

create or replace function public.create_global_announcement(
  p_token uuid,
  p_title text,
  p_body text,
  p_announcement_type text default 'announcement'
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  role_name text;
  announcement_id uuid;
  normalized_type text := lower(trim(coalesce(p_announcement_type, 'announcement')));
  clean_title text := trim(coalesce(p_title, ''));
  clean_body text := trim(coalesce(p_body, ''));
begin
  uid := public.app_current_user_id(p_token);
  role_name := public.current_role(p_token);

  if uid is null or role_name <> 'leader' then
    raise exception 'إرسال الإعلانات العامة متاح للقائد فقط';
  end if;

  if clean_title = '' then raise exception 'عنوان الإعلان مطلوب'; end if;
  if clean_body = '' then raise exception 'نص الإعلان مطلوب'; end if;
  if char_length(clean_title) > 200 then raise exception 'عنوان الإعلان طويل جدًا'; end if;
  if char_length(clean_body) > 4000 then raise exception 'نص الإعلان طويل جدًا'; end if;
  if normalized_type not in ('important','warning','announcement') then
    raise exception 'نوع الإعلان غير صالح';
  end if;

  insert into public.global_announcements(
    title, body, announcement_type, active, created_by_user_id
  )
  values(clean_title, clean_body, normalized_type, true, uid)
  returning id into announcement_id;

  return json_build_object(
    'ok', true,
    'id', announcement_id,
    'title', clean_title,
    'body', clean_body,
    'announcement_type', normalized_type
  );
end;
$$;

revoke all on function public.create_global_announcement(uuid,text,text,text)
from public, anon, authenticated;
grant execute on function public.create_global_announcement(uuid,text,text,text)
to anon, authenticated;

create or replace function public.list_global_announcements_for_member(p_token uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  role_name text;
  result json;
begin
  uid := public.app_current_user_id(p_token);
  role_name := public.current_role(p_token);

  if uid is null or role_name <> 'member' then
    return '[]'::json;
  end if;

  select coalesce(
    json_agg(
      json_build_object(
        'id', a.id,
        'title', a.title,
        'body', a.body,
        'announcement_type', a.announcement_type,
        'created_at', a.created_at
      )
      order by a.created_at desc
    ),
    '[]'::json
  )
  into result
  from public.global_announcements a
  where a.active = true
    and not exists (
      select 1 from public.global_announcement_reads r
      where r.announcement_id = a.id and r.user_id = uid
    );

  return result;
end;
$$;

revoke all on function public.list_global_announcements_for_member(uuid)
from public, anon, authenticated;
grant execute on function public.list_global_announcements_for_member(uuid)
to anon, authenticated;

create or replace function public.acknowledge_global_announcement(
  p_token uuid,
  p_announcement_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  role_name text;
begin
  uid := public.app_current_user_id(p_token);
  role_name := public.current_role(p_token);

  if uid is null or role_name <> 'member' then
    raise exception 'تأكيد الإعلان متاح للأعضاء فقط';
  end if;

  if not exists (
    select 1 from public.global_announcements a
    where a.id = p_announcement_id and a.active = true
  ) then
    raise exception 'الإعلان غير موجود أو لم يعد فعالًا';
  end if;

  insert into public.global_announcement_reads(announcement_id, user_id)
  values(p_announcement_id, uid)
  on conflict (announcement_id, user_id) do nothing;

  return true;
end;
$$;

revoke all on function public.acknowledge_global_announcement(uuid,uuid)
from public, anon, authenticated;
grant execute on function public.acknowledge_global_announcement(uuid,uuid)
to anon, authenticated;

notify pgrst, 'reload schema';
