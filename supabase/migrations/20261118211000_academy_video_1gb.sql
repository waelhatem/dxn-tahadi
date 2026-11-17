-- Production migration: enable up to 1 GiB in database for both academy video destinations.
-- Free projects remain capped at 50 MB by Storage global limits. Set
-- Storage > Settings > Global file size limit >= chosen ACADEMY_VIDEO_MAX_MB.
-- Keep bucket platform-academy at least as large (NULL means global limit).
-- Set Vercel ACADEMY_VIDEO_MAX_MB to 50..1024 ONLY after Storage is configured.
-- The defaults remain 50 MB and preserve all previously published video records.
BEGIN;
ALTER TABLE public.academy_leader_videos
  DROP CONSTRAINT IF EXISTS academy_leader_videos_file_size_check;
ALTER TABLE public.academy_leader_videos
  ADD CONSTRAINT academy_leader_videos_file_size_check CHECK (file_size BETWEEN 1 AND 1073741824);

CREATE OR REPLACE FUNCTION public.academy_guide_video_publish(p_token uuid, p_title text, p_description text, p_object_path text, p_content_type text, p_file_size bigint)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid;v_id uuid;v_announcement_id uuid;
v_title text:=btrim(coalesce(p_title,''));v_description text:=btrim(coalesce(p_description,''));
v_path text:=btrim(coalesce(p_object_path,''));v_type text:=lower(btrim(coalesce(p_content_type,'')));
v_object storage.objects%rowtype;v_size bigint;
begin
 uid:=public.app_current_user_id(p_token);
 if uid is null or public.app_current_role(p_token)<>'leader' then raise exception 'إضافة فيديو إلى الدليل متاحة للقائد فقط';end if;
 if char_length(v_title) not between 4 and 160 or char_length(v_description) not between 5 and 700 then raise exception 'العنوان أو الوصف غير صالح';end if;
 if v_type not in('video/mp4','video/quicktime','video/webm','video/x-m4v','video/3gpp') then raise exception 'نوع ملف الفيديو غير مدعوم';end if;
 if p_file_size is null or p_file_size not between 1 and 1073741824 then raise exception 'حجم الفيديو أكبر من الحد المسموح';end if;
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
end $function$
;

CREATE OR REPLACE FUNCTION public.academy_leader_video_publish(p_token uuid, p_title text, p_description text, p_object_path text, p_content_type text, p_file_size bigint)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid;v_id uuid;v_announcement_id uuid;
v_title text:=btrim(coalesce(p_title,''));v_description text:=btrim(coalesce(p_description,''));
v_path text:=btrim(coalesce(p_object_path,''));v_type text:=lower(btrim(coalesce(p_content_type,'')));
v_object storage.objects%rowtype;v_size bigint;v_is_first boolean;
begin
 uid:=public.app_current_user_id(p_token);
 if uid is null or public.app_current_role(p_token)<>'leader' then raise exception 'نشر فيديوهات القائد متاح للقائد فقط';end if;
 if char_length(v_title) not between 4 and 160 or char_length(v_description) not between 5 and 700 then raise exception 'العنوان أو الوصف غير صالح';end if;
 if v_type not in('video/mp4','video/quicktime','video/webm','video/x-m4v','video/3gpp') then raise exception 'نوع ملف الفيديو غير مدعوم';end if;
 if p_file_size is null or p_file_size not between 1 and 1073741824 then raise exception 'حجم الفيديو أكبر من الحد المسموح';end if;
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
end $function$
;

-- Preserve the previous leader-only authorization, exact object-path, file-size
-- verification against storage.objects and atomic announcement publication.
REVOKE ALL ON FUNCTION public.academy_guide_video_publish(uuid,text,text,text,text,bigint),
  public.academy_leader_video_publish(uuid,text,text,text,text,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.academy_guide_video_publish(uuid,text,text,text,text,bigint),
  public.academy_leader_video_publish(uuid,text,text,text,text,bigint)
  TO anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
