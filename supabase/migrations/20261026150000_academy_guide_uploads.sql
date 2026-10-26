-- Keep guide uploads separate from leader explanations without disturbing the three legacy YouTube guide videos.
begin;

alter table public.academy_leader_videos
  add column if not exists placement text not null default 'leader';
alter table public.academy_leader_videos
  add constraint academy_video_placement_check check(placement in ('leader','guide'));
alter table public.academy_leader_videos
  add constraint academy_guide_not_welcome_check check(placement='leader' or not is_welcome);
create index if not exists academy_video_placement_recent_idx
  on public.academy_leader_videos(placement,published_at desc)
  where status='published';

-- Old clients and the independent leader library continue to see only leader videos.
create or replace function public.academy_leader_videos_list(p_token uuid)
returns table(id uuid,title text,description text,content_type text,file_size bigint,published_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
 if public.app_current_user_id(p_token) is null then raise exception 'انتهت الجلسة';end if;
 return query select v.id,v.title,v.description,v.content_type,v.file_size,v.published_at
 from public.academy_leader_videos v
 where v.status='published' and v.placement='leader'
 order by v.published_at desc,v.id desc limit 150;
end $$;

create or replace function public.academy_leader_videos_list_v2(p_token uuid)
returns table(id uuid,title text,description text,content_type text,file_size bigint,published_at timestamptz,is_welcome boolean)
language plpgsql security definer set search_path='' as $$
begin
 if public.app_current_user_id(p_token) is null then raise exception 'انتهت الجلسة';end if;
 return query select v.id,v.title,v.description,v.content_type,v.file_size,v.published_at,v.is_welcome
 from public.academy_leader_videos v
 where v.status='published' and v.placement='leader'
 order by v.published_at desc,v.id desc limit 150;
end $$;

create or replace function public.academy_guide_videos_list(p_token uuid)
returns table(id uuid,title text,description text,content_type text,file_size bigint,published_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
 if public.app_current_user_id(p_token) is null then raise exception 'انتهت الجلسة';end if;
 return query select v.id,v.title,v.description,v.content_type,v.file_size,v.published_at
 from public.academy_leader_videos v
 where v.status='published' and v.placement='guide'
 order by v.published_at asc,v.id asc limit 150;
end $$;
revoke all on function public.academy_guide_videos_list(uuid) from public,anon,authenticated;
grant execute on function public.academy_guide_videos_list(uuid) to anon,authenticated;

-- The first leader video remains the welcome video even if guide videos were uploaded earlier.
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
 if p_file_size is null or p_file_size not between 1 and 104857600 then raise exception 'حجم الفيديو أكبر من الحد المسموح';end if;
 if v_path !~ ('^leader/'||uid::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp4|mov|webm|m4v|3gp)$') then raise exception 'مسار الفيديو غير صالح';end if;
 select * into v_object from storage.objects where bucket_id='platform-academy' and name=v_path limit 1;
 if v_object.id is null then raise exception 'ملف الفيديو لم يكتمل رفعه بعد';end if;
 v_size:=nullif(v_object.metadata->>'size','')::bigint;
 if v_size is distinct from p_file_size then raise exception 'حجم الفيديو المرفوع لا يطابق الملف المحدد';end if;
 perform pg_advisory_xact_lock(241019,1710);
 select not exists(select 1 from public.academy_leader_videos where placement='leader') into v_is_first;
 insert into public.academy_leader_videos(title,description,object_path,content_type,file_size,created_by,placement,is_welcome)
 values(v_title,v_description,v_path,v_type,p_file_size,uid,'leader',v_is_first) returning id into v_id;
 insert into public.global_announcements(title,body,announcement_type,active,created_by_user_id,source,video_id)
 values('🎬 شرح جديد: '||v_title,
 '🎥 تم نشر شرح جديد في أكاديمية المجتمع: '||v_title||' — '||v_description||' 📚 اضغط «▶ مشاهدة الفيديو» للانتقال إليه.',
 'announcement',true,uid,'video',v_id) returning id into v_announcement_id;
 return json_build_object('ok',true,'video_id',v_id,'announcement_id',v_announcement_id);
end $$;

-- Signed uploads are already issued exclusively to leader sessions by the existing storage endpoint.
create or replace function public.academy_guide_video_publish(
 p_token uuid,p_title text,p_description text,p_object_path text,p_content_type text,p_file_size bigint
)
returns json language plpgsql security definer set search_path='' as $$
declare uid uuid;v_id uuid;v_announcement_id uuid;
v_title text:=btrim(coalesce(p_title,''));v_description text:=btrim(coalesce(p_description,''));
v_path text:=btrim(coalesce(p_object_path,''));v_type text:=lower(btrim(coalesce(p_content_type,'')));
v_object storage.objects%rowtype;v_size bigint;
begin
 uid:=public.app_current_user_id(p_token);
 if uid is null or public.app_current_role(p_token)<>'leader' then raise exception 'إضافة فيديو إلى الدليل متاحة للقائد فقط';end if;
 if char_length(v_title) not between 4 and 160 or char_length(v_description) not between 5 and 700 then raise exception 'العنوان أو الوصف غير صالح';end if;
 if v_type not in('video/mp4','video/quicktime','video/webm','video/x-m4v','video/3gpp') then raise exception 'نوع ملف الفيديو غير مدعوم';end if;
 if p_file_size is null or p_file_size not between 1 and 104857600 then raise exception 'حجم الفيديو أكبر من الحد المسموح';end if;
 if v_path !~ ('^leader/'||uid::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp4|mov|webm|m4v|3gp)$') then raise exception 'مسار الفيديو غير صالح';end if;
 select * into v_object from storage.objects where bucket_id='platform-academy' and name=v_path limit 1;
 if v_object.id is null then raise exception 'ملف الفيديو لم يكتمل رفعه بعد';end if;
 v_size:=nullif(v_object.metadata->>'size','')::bigint;
 if v_size is distinct from p_file_size then raise exception 'حجم الفيديو المرفوع لا يطابق الملف المحدد';end if;
 insert into public.academy_leader_videos(title,description,object_path,content_type,file_size,created_by,placement,is_welcome)
 values(v_title,v_description,v_path,v_type,p_file_size,uid,'guide',false) returning id into v_id;
 insert into public.global_announcements(title,body,announcement_type,active,created_by_user_id,source,video_id)
 values('📘 فيديو جديد في دليل المجتمع: '||v_title,
 '🎥 تمت إضافة فيديو جديد إلى «دليل استخدام المجتمع»: '||v_title||' — '||v_description||' 📚 اضغط «▶ مشاهدة الفيديو» لفتحه.',
 'announcement',true,uid,'video',v_id) returning id into v_announcement_id;
 return json_build_object('ok',true,'video_id',v_id,'announcement_id',v_announcement_id);
end $$;
revoke all on function public.academy_guide_video_publish(uuid,text,text,text,text,bigint) from public,anon,authenticated;
grant execute on function public.academy_guide_video_publish(uuid,text,text,text,text,bigint) to anon,authenticated;

-- Guide videos cannot become the automatic welcome video for new joiners.
create or replace function public.academy_leader_video_set_welcome(p_token uuid,p_video_id uuid)
returns json language plpgsql security definer set search_path='' as $$
declare uid uuid;v_title text;
begin
 uid:=public.app_current_user_id(p_token);
 if uid is null or public.app_current_role(p_token)<>'leader' then raise exception 'هذا الإجراء متاح للقائد فقط';end if;
 perform pg_advisory_xact_lock(241019,1710);
 select v.title into v_title from public.academy_leader_videos v
 where v.id=p_video_id and v.status='published' and v.placement='leader';
 if v_title is null then raise exception 'الفيديو غير موجود في شروحات القائد';end if;
 update public.academy_leader_videos set is_welcome=false where is_welcome=true;
 update public.academy_leader_videos set is_welcome=true where id=p_video_id;
 return json_build_object('ok',true,'video_id',p_video_id);
end $$;

notify pgrst,'reload schema';
commit;
