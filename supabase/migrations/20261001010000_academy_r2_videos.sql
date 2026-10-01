-- V86.74 — Academy videos move from YouTube links to direct Cloudflare R2 video files.
-- SAFETY: this migration refuses to transform academy_videos if it already contains rows.
-- The existing academy_videos table is expected to be empty before this migration.

do $$
declare row_count bigint;
begin
  if to_regclass('public.academy_videos') is null then
    raise exception 'academy_videos table does not exist; aborting';
  end if;
  execute 'select count(*) from public.academy_videos' into row_count;
  if row_count <> 0 then
    raise exception 'academy_videos is not empty (% rows); refusing R2 migration', row_count;
  end if;
end $$;

drop index if exists public.academy_videos_published_order_idx;

drop function if exists public.list_academy_videos(uuid);
drop function if exists public.create_academy_video(uuid,text,text,text,text);
drop function if exists public.prepare_academy_video_upload(uuid,text,text,bigint);
drop function if exists public.complete_academy_video_upload(uuid,uuid,text,bigint,text,text);

alter table public.academy_videos
  drop constraint if exists academy_videos_canonical_url,
  drop column if exists youtube_url,
  drop column if exists youtube_id;

alter table public.academy_videos
  add column if not exists object_key text,
  add column if not exists file_url text,
  add column if not exists file_size bigint,
  add column if not exists content_type text;

alter table public.academy_videos
  alter column object_key set not null,
  alter column file_url set not null,
  alter column file_size set not null,
  alter column content_type set not null;

alter table public.academy_videos
  add constraint academy_videos_object_key_unique unique(object_key),
  add constraint academy_videos_file_size_positive check (file_size > 0),
  add constraint academy_videos_content_type_video check (content_type in ('video/mp4','video/webm','video/quicktime'));

create index if not exists academy_videos_published_order_idx
  on public.academy_videos(sort_order, created_at)
  where status = 'published';

alter table public.academy_videos enable row level security;
revoke all on table public.academy_videos from public, anon, authenticated;

create or replace function public.list_academy_videos(p_token uuid)
returns table(
  id uuid,
  title text,
  section text,
  file_url text,
  file_size bigint,
  content_type text,
  sort_order integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $function$
begin
  if not exists(
    select 1 from public.sessions s
    join public.app_users u on u.id=s.user_id
    where s.token=p_token and s.expires_at>now() and u.active=true
  ) then raise exception 'انتهت الجلسة'; end if;

  return query
    select v.id,v.title,v.section,v.file_url,v.file_size,v.content_type,v.sort_order,v.created_at
    from public.academy_videos v
    where v.status='published'
    order by v.sort_order asc,v.created_at asc;
end;
$function$;

create or replace function public.prepare_academy_video_upload(
  p_token uuid,
  p_title text,
  p_section text,
  p_file_size bigint,
  p_content_type text,
  p_object_key text,
  p_file_url text
)
returns uuid
language plpgsql
security definer
set search_path=public
as $function$
declare uid uuid; role_name text; video_id uuid;
begin
  select s.user_id,lower(u.role) into uid,role_name
  from public.sessions s join public.app_users u on u.id=s.user_id
  where s.token=p_token and s.expires_at>now() and u.active=true limit 1;

  if uid is null then raise exception 'انتهت الجلسة'; end if;
  if role_name<>'leader' then raise exception 'إضافة فيديو للأكاديمية متاحة للقائد فقط'; end if;
  if btrim(coalesce(p_title,''))='' or char_length(btrim(p_title))>160 then raise exception 'عنوان الفيديو مطلوب ولا يتجاوز 160 حرفًا'; end if;
  if char_length(btrim(coalesce(p_section,'')))>80 then raise exception 'اسم القسم لا يتجاوز 80 حرفًا'; end if;
  if p_file_size<=0 or p_file_size>2147483648 then raise exception 'حجم الفيديو يجب أن يكون أكبر من صفر ولا يتجاوز 2 GB'; end if;
  if p_content_type not in ('video/mp4','video/webm','video/quicktime') then raise exception 'نوع الفيديو غير مدعوم'; end if;
  if p_object_key is null or p_object_key !~ '^academy-videos/[0-9a-f-]{36}$' then raise exception 'مفتاح ملف غير صالح'; end if;
  if p_file_url is null or btrim(p_file_url)='' then raise exception 'رابط الفيديو مطلوب'; end if;

  insert into public.academy_videos(title,section,object_key,file_url,file_size,content_type,status,sort_order,created_by)
  values(btrim(p_title),btrim(coalesce(p_section,'')),p_object_key,p_file_url,p_file_size,p_content_type,'draft',
    coalesce((select max(sort_order)+1 from public.academy_videos),1),uid)
  returning id into video_id;
  return video_id;
end;
$function$;

create or replace function public.complete_academy_video_upload(
  p_token uuid,
  p_video_id uuid,
  p_file_size bigint,
  p_content_type text
)
returns table(id uuid,title text,section text,file_url text,file_size bigint,content_type text,sort_order integer)
language plpgsql
security definer
set search_path=public
as $function$
declare uid uuid; role_name text;
begin
  select s.user_id,lower(u.role) into uid,role_name
  from public.sessions s join public.app_users u on u.id=s.user_id
  where s.token=p_token and s.expires_at>now() and u.active=true limit 1;
  if uid is null then raise exception 'انتهت الجلسة'; end if;
  if role_name<>'leader' then raise exception 'إدارة فيديوهات الأكاديمية متاحة للقائد فقط'; end if;

  return query
    update public.academy_videos v
    set status='published',file_size=p_file_size,content_type=p_content_type,updated_at=now()
    where v.id=p_video_id and v.created_by=uid and v.status='draft'
      and v.file_size=p_file_size and v.content_type=p_content_type
    returning v.id,v.title,v.section,v.file_url,v.file_size,v.content_type,v.sort_order;

  if not found then raise exception 'ملف الفيديو غير موجود أو بياناته لا تطابق التسجيل'; end if;
end;
$function$;

revoke all on function public.list_academy_videos(uuid) from public,anon,authenticated;
revoke all on function public.prepare_academy_video_upload(uuid,text,text,bigint,text,text,text) from public,anon,authenticated;
revoke all on function public.complete_academy_video_upload(uuid,uuid,bigint,text) from public,anon,authenticated;

grant execute on function public.list_academy_videos(uuid) to service_role;
grant execute on function public.prepare_academy_video_upload(uuid,text,text,bigint,text,text,text) to service_role;
grant execute on function public.complete_academy_video_upload(uuid,uuid,bigint,text) to service_role;

notify pgrst,'reload schema';
