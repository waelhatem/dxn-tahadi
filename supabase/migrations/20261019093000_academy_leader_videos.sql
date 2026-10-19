-- Isolated leader videos, video announcements, and new-member cutoff.
begin;
create table if not exists public.academy_leader_videos (
 id uuid primary key default gen_random_uuid(),
 title text not null check(char_length(btrim(title)) between 4 and 160),
 description text not null default '' check(char_length(description)<=700),
 object_path text not null unique,
 content_type text not null,
 file_size bigint not null check(file_size between 1 and 52428800),
 created_by uuid not null references public.app_users(id),
 published_at timestamptz not null default now(),
 status text not null default 'published' check(status in ('published','hidden'))
);
create index if not exists academy_leader_videos_recent_idx on public.academy_leader_videos(published_at desc) where status='published';
alter table public.academy_leader_videos enable row level security;
revoke all on public.academy_leader_videos from public,anon,authenticated;
alter table public.global_announcements add column if not exists video_id uuid references public.academy_leader_videos(id);
alter table public.global_announcements drop constraint if exists global_announcements_source_check;
alter table public.global_announcements add constraint global_announcements_source_check check(source in('manual','daily_ai','video'));

create or replace function public.academy_leader_videos_list(p_token uuid)
returns table(id uuid,title text,description text,content_type text,file_size bigint,published_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
 if public.app_current_user_id(p_token) is null then raise exception 'انتهت الجلسة'; end if;
 return query select v.id,v.title,v.description,v.content_type,v.file_size,v.published_at
 from public.academy_leader_videos v where v.status='published'
 order by v.published_at desc,v.id desc limit 150;
end $$;
revoke all on function public.academy_leader_videos_list(uuid) from public,anon,authenticated;
grant execute on function public.academy_leader_videos_list(uuid) to anon,authenticated;

create or replace function public.academy_leader_video_publish(
 p_token uuid,p_title text,p_description text,p_object_path text,p_content_type text,p_file_size bigint
)
returns json language plpgsql security definer set search_path='' as $$
declare uid uuid;v_id uuid;v_announcement_id uuid;
v_title text:=btrim(coalesce(p_title,''));v_description text:=btrim(coalesce(p_description,''));
v_path text:=btrim(coalesce(p_object_path,''));v_type text:=lower(btrim(coalesce(p_content_type,'')));
v_object storage.objects%rowtype;v_size bigint;
begin
 uid:=public.app_current_user_id(p_token);
 if uid is null or public.app_current_role(p_token)<>'leader' then raise exception 'نشر فيديوهات القائد متاح للقائد فقط';end if;
 if char_length(v_title) not between 4 and 160 or char_length(v_description) not between 5 and 700 then raise exception 'العنوان أو الوصف غير صالح';end if;
 if v_type not in('video/mp4','video/quicktime','video/webm','video/x-m4v','video/3gpp') then raise exception 'نوع ملف الفيديو غير مدعوم';end if;
 if p_file_size is null or p_file_size not between 1 and 52428800 then raise exception 'حجم الفيديو أكبر من الحد المسموح (50 ميغابايت)';end if;
 if v_path !~ ('^leader/'||uid::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp4|mov|webm|m4v|3gp)$') then raise exception 'مسار الفيديو غير صالح';end if;
 select * into v_object from storage.objects where bucket_id='platform-academy' and name=v_path limit 1;
 if v_object.id is null then raise exception 'ملف الفيديو لم يكتمل رفعه بعد';end if;
 v_size:=nullif(v_object.metadata->>'size','')::bigint;
 if v_size is distinct from p_file_size then raise exception 'حجم الفيديو المرفوع لا يطابق الملف المحدد';end if;
 insert into public.academy_leader_videos(title,description,object_path,content_type,file_size,created_by)
 values(v_title,v_description,v_path,v_type,p_file_size,uid) returning id into v_id;
 insert into public.global_announcements(title,body,announcement_type,active,created_by_user_id,source,video_id)
 values('🎬 شرح جديد: '||v_title,
 case when v_description<>'' then '🎥 تم نشر شرح جديد في أكاديمية المجتمع: '||v_title||' — '||v_description||' 📚 اضغط «▶ مشاهدة الفيديو» للانتقال إليه.'
 else '🎥 تم نشر شرح جديد في أكاديمية المجتمع: '||v_title||' 📚 اضغط «▶ مشاهدة الفيديو» للانتقال إليه.' end,
 'announcement',true,uid,'video',v_id) returning id into v_announcement_id;
 return json_build_object('ok',true,'video_id',v_id,'announcement_id',v_announcement_id);
end $$;
revoke all on function public.academy_leader_video_publish(uuid,text,text,text,text,bigint) from public,anon,authenticated;
grant execute on function public.academy_leader_video_publish(uuid,text,text,text,text,bigint) to anon,authenticated;

create or replace function public.list_global_announcements_for_member(p_token uuid)
returns json language plpgsql security definer set search_path='' as $$
declare uid uuid;registered_at timestamptz;result json;
begin
 uid:=public.app_current_user_id(p_token);
 if uid is null or public.app_current_role(p_token)<>'member' then return '[]'::json;end if;
 select u.created_at into registered_at from public.app_users u where u.id=uid and u.active;
 if registered_at is null then return '[]'::json;end if;
 select coalesce(json_agg(json_build_object(
  'id',a.id,'title',a.title,'body',a.body,'announcement_type',a.announcement_type,
  'source',a.source,'video_id',a.video_id,'created_at',a.created_at
 ) order by case
  when a.source='manual' and a.announcement_type='important' then 0
  when a.source='manual' and a.announcement_type='warning' then 1
  when a.source='video' then 2 when a.source='daily_ai' then 3 else 4 end,
  a.created_at desc),'[]'::json)
 into result from public.global_announcements a
 where a.active and a.created_at>=registered_at
 and (a.source in('manual','video')
 or (a.source='daily_ai' and a.publish_date=(now() at time zone 'Asia/Baghdad')::date and a.expires_at>now()))
 and not exists(select 1 from public.global_announcement_reads r where r.announcement_id=a.id and r.user_id=uid);
 return result;
end $$;
revoke all on function public.list_global_announcements_for_member(uuid) from public,anon,authenticated;
grant execute on function public.list_global_announcements_for_member(uuid) to anon,authenticated;
notify pgrst,'reload schema';
commit;
