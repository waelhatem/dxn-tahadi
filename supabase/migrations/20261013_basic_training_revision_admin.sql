-- STAGED ONLY: deploy to isolated Supabase test database first.
-- Depends on 20261013_basic_training_persistence_90_80.sql and approved questions.
BEGIN;
ALTER TABLE public.basic_training_lessons
 ADD COLUMN IF NOT EXISTS active_revision integer NOT NULL DEFAULT 1;
ALTER TABLE public.basic_training_attempts
 ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1;

-- Each revision is an immutable publication snapshot once published.
CREATE TABLE IF NOT EXISTS public.basic_training_revisions (
 training_no integer NOT NULL REFERENCES public.basic_training_lessons(training_no),
 revision integer NOT NULL CHECK(revision >= 1),
 title text NOT NULL,
 video_id text NOT NULL CHECK(video_id ~ '^[A-Za-z0-9_-]{11}$'),
 expected_duration_seconds integer NOT NULL CHECK(expected_duration_seconds BETWEEN 60 AND 14400),
 questions jsonb NOT NULL CHECK(jsonb_typeof(questions)='array' AND jsonb_array_length(questions)=20),
 status text NOT NULL CHECK(status IN ('draft','published')),
 created_at timestamptz NOT NULL DEFAULT now(),
 published_at timestamptz,
 PRIMARY KEY(training_no,revision)
);
ALTER TABLE public.basic_training_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.basic_training_revisions FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.basic_training_revisions TO service_role;

-- Seed previously approved training as revision 1.
INSERT INTO public.basic_training_revisions(training_no,revision,title,video_id,expected_duration_seconds,questions,status,published_at)
SELECT l.training_no,1,l.title,l.video_id,l.expected_duration_seconds,
 COALESCE((SELECT jsonb_agg(jsonb_build_object(
  'no',q.question_no,'question',q.question,'options',q.options,'correct_index',q.correct_index)
  ORDER BY q.question_no) FROM public.basic_training_questions q
  WHERE q.training_no=l.training_no),'[]'::jsonb),
 'published',now()
FROM public.basic_training_lessons l
WHERE (SELECT count(*) FROM public.basic_training_questions q WHERE q.training_no=l.training_no)=20
ON CONFLICT(training_no,revision) DO NOTHING;

-- Historical attempts keep their revision; new attempts inherit the active revision.
CREATE OR REPLACE FUNCTION public.basic_training_stamp_attempt_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
BEGIN
 SELECT active_revision INTO NEW.revision
 FROM public.basic_training_lessons WHERE training_no=NEW.training_no;
 RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS basic_training_stamp_revision ON public.basic_training_attempts;
CREATE TRIGGER basic_training_stamp_revision
BEFORE INSERT ON public.basic_training_attempts
FOR EACH ROW EXECUTE FUNCTION public.basic_training_stamp_attempt_revision();
REVOKE ALL ON FUNCTION public.basic_training_stamp_attempt_revision() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.basic_training_admin_revision(
 p_token uuid,p_training_no integer,p_action text,p_payload jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE v_user uuid; v_l public.basic_training_lessons%rowtype;
 v_rev public.basic_training_revisions%rowtype; v_q jsonb;
 v_no integer; v_item jsonb; v_count integer;
 v_title text;v_video text;v_duration integer; v_new integer;
BEGIN
 v_user:=public.app_current_user_id(p_token);
 IF v_user IS NULL OR NOT EXISTS(
   SELECT 1 FROM public.app_users WHERE id=v_user AND active=true AND role='leader'
 ) THEN RAISE EXCEPTION 'غير مخول بإدارة التدريبات';END IF;
 SELECT * INTO v_l FROM public.basic_training_lessons
 WHERE training_no=p_training_no FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'التدريب غير موجود'; END IF;
 IF p_action='get' THEN
   SELECT * INTO v_rev FROM public.basic_training_revisions
   WHERE training_no=p_training_no AND status='draft'
   ORDER BY revision DESC LIMIT 1;
   IF NOT FOUND THEN
     SELECT * INTO v_rev FROM public.basic_training_revisions
     WHERE training_no=p_training_no AND revision=v_l.active_revision;
   END IF;
   IF NOT FOUND THEN RAISE EXCEPTION 'لا توجد أسئلة منشورة لهذا التدريب';END IF;
 ELSIF p_action='save' THEN
   IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' THEN
     RAISE EXCEPTION 'بيانات التعديل غير صحيحة';END IF;
   v_title:=btrim(p_payload->>'title');
   v_video:=btrim(p_payload->>'video_id');
   v_duration:=(p_payload->>'expected_duration_seconds')::integer;
   v_q:=p_payload->'questions';
   IF length(v_title)<4 OR v_video !~ '^[A-Za-z0-9_-]{11}$'
      OR v_duration NOT BETWEEN 60 AND 14400
      OR jsonb_typeof(v_q)<>'array' OR jsonb_array_length(v_q)<>20
   THEN RAISE EXCEPTION 'عنوان الفيديو أو الأسئلة العشرون غير مكتملة';END IF;
   FOR v_no IN 1..20 LOOP
     v_item:=v_q->(v_no-1);
     IF jsonb_typeof(v_item)<>'object'
       OR (v_item->>'no')::integer<>v_no
       OR length(btrim(v_item->>'question'))<3
       OR jsonb_typeof(v_item->'options')<>'array'
       OR jsonb_array_length(v_item->'options')<>3
       OR (v_item->>'correct_index')::integer NOT BETWEEN 0 AND 2
       OR EXISTS(
        SELECT 1 FROM jsonb_array_elements_text(v_item->'options') x
        WHERE length(btrim(x))<1
       )
     THEN RAISE EXCEPTION 'السؤال % غير صالح',v_no;END IF;
   END LOOP;
   SELECT * INTO v_rev FROM public.basic_training_revisions
   WHERE training_no=p_training_no AND status='draft' ORDER BY revision DESC LIMIT 1;
   IF FOUND THEN
     UPDATE public.basic_training_revisions
     SET title=v_title,video_id=v_video,expected_duration_seconds=v_duration,
         questions=v_q
     WHERE training_no=p_training_no AND revision=v_rev.revision
     RETURNING * INTO v_rev;
   ELSE
     SELECT COALESCE(max(revision),0)+1 INTO v_new
     FROM public.basic_training_revisions WHERE training_no=p_training_no;
     INSERT INTO public.basic_training_revisions(
       training_no,revision,title,video_id,expected_duration_seconds,questions,status)
     VALUES(p_training_no,v_new,v_title,v_video,v_duration,v_q,'draft')
     RETURNING * INTO v_rev;
   END IF;
 ELSIF p_action='publish' THEN
   SELECT * INTO v_rev FROM public.basic_training_revisions
   WHERE training_no=p_training_no AND status='draft' ORDER BY revision DESC LIMIT 1;
   IF NOT FOUND THEN RAISE EXCEPTION 'لا توجد مسودة للنشر';END IF;
   IF v_rev.video_id<>v_l.video_id AND EXISTS(
     SELECT 1 FROM public.basic_training_progress WHERE training_no=p_training_no
   ) THEN
     RAISE EXCEPTION 'تغيير الفيديو مع وجود تقدم محفوظ يحتاج سياسة ترحيل مستقلة؛ لم يُنشر';
   END IF;
   DELETE FROM public.basic_training_questions WHERE training_no=p_training_no;
   INSERT INTO public.basic_training_questions(training_no,question_no,question,options,correct_index)
   SELECT p_training_no,(x->>'no')::integer,x->>'question',
       x->'options',(x->>'correct_index')::integer
   FROM jsonb_array_elements(v_rev.questions) x;
   UPDATE public.basic_training_lessons
   SET title=v_rev.title,video_id=v_rev.video_id,
       expected_duration_seconds=v_rev.expected_duration_seconds,
       active_revision=v_rev.revision,updated_at=now()
   WHERE training_no=p_training_no;
   UPDATE public.basic_training_revisions
   SET status='published',published_at=now()
   WHERE training_no=p_training_no AND revision=v_rev.revision
   RETURNING * INTO v_rev;
 ELSE RAISE EXCEPTION 'الإجراء غير معروف';END IF;
 RETURN jsonb_build_object('training_no',v_rev.training_no,'revision',v_rev.revision,
 'title',v_rev.title,'video_id',v_rev.video_id,
 'expected_duration_seconds',v_rev.expected_duration_seconds,
 'questions',v_rev.questions,'status',v_rev.status,
 'active_revision',(SELECT active_revision FROM public.basic_training_lessons WHERE training_no=p_training_no));
END $fn$;
REVOKE ALL ON FUNCTION public.basic_training_admin_revision(uuid,integer,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.basic_training_admin_revision(uuid,integer,text,jsonb) TO anon,authenticated,service_role;
COMMIT;
