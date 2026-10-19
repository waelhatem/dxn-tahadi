-- Allow future 100 MB files after Supabase plan supports them; keep the present Free upload cap enforced by the API.
-- First leader video is the welcome guide for members who join later; all other old announcements stay excluded.
begin;
alter table public.academy_leader_videos
  add column if not exists is_welcome boolean not null default false;
create unique index if not exists academy_one_welcome_video
  on public.academy_leader_videos(is_welcome) where is_welcome=true;
alter table public.academy_leader_videos
  drop constraint if exists academy_leader_videos_file_size_check;
alter table public.academy_leader_videos
  add constraint academy_leader_videos_file_size_check check(file_size between 1 and 104857600);

create or replace function public.academy_leader_video_publish(
 p_token uuid,p_title text,p_description text,p_object_path text,p_content_type text,p_file_size bigint
)
returns json language plpgsql security definer set search_path='' as $$
declare uid uuid;v_id uuid;v_announcement_id uuid;
v_title text:=btrim(coalesce(p_title,''));v_description text:=btrim(coalesce(p_description,''));
v_path text:=btrim(coalesce(p_object_path,''));v_type text:=lower(btrim(coalesce(p_content_type,'')));
v_object storage.objects%rowtype;v_size bigint;v_is_first boolean;
begin
 uid:=public.app_current_user_id(p_token);
 if uid is null or public.app_current_role(p_token)<>'leader' then raise exception 'نشر فيديوهات القائد متاح للقائد فقط';end if;
 if char_length(v_title) not between 4 and 160 or char_length(v_description) not between 5 and 700 then raise exception 'العنوان أو الوصف غير صالح';end if;
 if v_type not in('video/mp4','video/quicktime','video/webm','video/x-m4v','video/3gpp') then raise exception 'نوع ملف الفيديو غير مدعوم';end if;
 if p_file_size is null or p_file_size not between 1 and 104857600 then raise exception 'حجم الفيديو أكبر من الحد المسموح (100 ميغابايت)';end if;
 if v_path !~ ('^leader/'||uid::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp4|mov|webm|m4v|3gp)$') then raise exception 'مسار الفيديو غير صالح';end if;
 select * into v_object from storage.objects where bucket_id='platform-academy' and name=v_path limit 1;
 if v_object.id is null then raise exception 'ملف الفيديو لم يكتمل رفعه بعد';end if;
 v_size:=nullif(v_object.metadata->>'size','')::bigint;
 if v_size is distinct from p_file_size then raise exception 'حجم الفيديو المرفوع لا يطابق الملف المحدد';end if;
 -- Serialize first video publishing; the first real upload becomes the permanent welcome guide.
 perform pg_advisory_xact_lock(241019,1710);
 select not exists(select 1 from public.academy_leader_videos) into v_is_first;
 insert into public.academy_leader_videos(title,description,object_path,content_type,file_size,created_by,is_welcome)
 values(v_title,v_description,v_path,v_type,p_file_size,uid,v_is_first) returning id into v_id;
 insert into public.global_announcements(title,body,announcement_type,active,created_by_user_id,source,video_id)
 values('🎬 شرح جديد: '||v_title,
 case when v_description<>'' then '🎥 تم نشر شرح جديد في أكاديمية المجتمع: '||v_title||' — '||v_description||' 📚 اضغط «▶ مشاهدة الفيديو» للانتقال إليه.'
 else '🎥 تم نشر شرح جديد في أكاديمية المجتمع: '||v_title||' 📚 اضغط «▶ مشاهدة الفيديو» للانتقال إليه.' end,
 'announcement',true,uid,'video',v_id) returning id into v_announcement_id;
 return json_build_object('ok',true,'video_id',v_id,'announcement_id',v_announcement_id);
end $$;

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
  'source',a.source,'video_id',a.video_id,'is_welcome',coalesce(v.is_welcome,false),'created_at',a.created_at
 ) order by case
  when a.source='video' and v.is_welcome and a.created_at<registered_at then -1
  when a.source='manual' and a.announcement_type='important' then 0
  when a.source='manual' and a.announcement_type='warning' then 1
  when a.source='video' then 2 when a.source='daily_ai' then 3 else 4 end,
  a.created_at desc),'[]'::json)
 into result from public.global_announcements a
 left join public.academy_leader_videos v
   on v.id=a.video_id and v.status='published'
 where a.active
   and (a.created_at>=registered_at
     or (a.source='video' and v.is_welcome=true and a.created_at<registered_at))
 and (a.source in('manual','video')
 or (a.source='daily_ai' and a.publish_date=(now() at time zone 'Asia/Baghdad')::date and a.expires_at>now()))
 and not exists(select 1 from public.global_announcement_reads r where r.announcement_id=a.id and r.user_id=uid);
 return result;
end $$;

-- Existing six-column list remains backwards-compatible for deployed older clients.
create or replace function public.academy_leader_videos_list_v2(p_token uuid)
returns table(id uuid,title text,description text,content_type text,file_size bigint,published_at timestamptz,is_welcome boolean)
language plpgsql security definer set search_path='' as $$
begin
 if public.app_current_user_id(p_token) is null then raise exception 'انتهت الجلسة';end if;
 return query
 select v.id,v.title,v.description,v.content_type,v.file_size,v.published_at,v.is_welcome
 from public.academy_leader_videos v
 where v.status='published'
 order by v.published_at desc,v.id desc limit 150;
end $$;
revoke all on function public.academy_leader_videos_list_v2(uuid) from public,anon,authenticated;
grant execute on function public.academy_leader_videos_list_v2(uuid) to anon,authenticated;

-- If a different video should be the welcome guide later, the leader can choose it.
create or replace function public.academy_leader_video_set_welcome(p_token uuid,p_video_id uuid)
returns json language plpgsql security definer set search_path='' as $$
declare uid uuid; v_title text;
begin
 uid:=public.app_current_user_id(p_token);
 if uid is null or public.app_current_role(p_token)<>'leader' then
   raise exception 'هذا الإجراء متاح للقائد فقط';
 end if;
 perform pg_advisory_xact_lock(241019,1710);
 select v.title into v_title
 from public.academy_leader_videos v
 where v.id=p_video_id and v.status='published';
 if v_title is null then raise exception 'الفيديو غير موجود';end if;
 update public.academy_leader_videos set is_welcome=false where is_welcome=true;
 update public.academy_leader_videos set is_welcome=true where id=p_video_id;
 return json_build_object('ok',true,'video_id',p_video_id);
end $$;
revoke all on function public.academy_leader_video_set_welcome(uuid,uuid) from public,anon,authenticated;
grant execute on function public.academy_leader_video_set_welcome(uuid,uuid) to anon,authenticated;
notify pgrst,'reload schema';
commit;
