-- PENDING REVIEW — unified training engine. Do not apply without the project owner's explicit approval.
--
-- Policy (same for the basic, professional and advanced tracks):
--   * Watching counts per watch attempt only. Every attempt starts at 0 s; seconds from earlier,
--     unfinished attempts are never added. Pausing inside an attempt is fine; an attempt with no report
--     for longer than training_engine_settings.idle_timeout_seconds ends ("idle").
--   * An attempt reaching 90% of the lesson's stored duration marks the lesson watch_completed for good.
--   * The quiz needs watch_completed; the next lesson needs the previous one watch_completed AND passed
--     (16/20 = 80/100). Submitting without passing never opens the next lesson.
--   * Earlier results stay: scores, attempts, passes and watch_completed are never deleted or reset.
--     Legacy cumulative watch_seconds stay in place for audit but no longer grant anything.
--
-- Deployment order (the old watch system keeps working until step 4):
--   1. apply this file (additive: new tables and functions only; nothing existing changes);
--   2. deploy the matching front end (training-engine.js);
--   3. verify it with a test account;
--   4. only then apply 20261015210000_disable_legacy_cumulative_watch.sql.
--
-- Rollback: drop the new functions and tables; they hold no earlier member results.

BEGIN;

-- ---------------------------------------------------------------- settings
CREATE TABLE IF NOT EXISTS public.training_engine_settings(
 id boolean PRIMARY KEY DEFAULT true CHECK (id),
 idle_timeout_seconds integer NOT NULL DEFAULT 600 CHECK (idle_timeout_seconds BETWEEN 60 AND 3600),
 min_watch_percent integer NOT NULL DEFAULT 90 CHECK (min_watch_percent=90),
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.training_engine_settings(id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------- professional track (server side)
CREATE TABLE IF NOT EXISTS public.professional_training_lessons(
 lesson_no integer PRIMARY KEY CHECK (lesson_no BETWEEN 1 AND 20),
 title text NOT NULL,
 instructor text NOT NULL,
 video_id text NOT NULL CHECK (video_id ~ '^[A-Za-z0-9_-]{11}$'),
 expected_duration_seconds integer NOT NULL CHECK (expected_duration_seconds BETWEEN 60 AND 14400),
 active boolean NOT NULL DEFAULT true,
 revision integer NOT NULL DEFAULT 1 CHECK (revision>=1),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.professional_training_questions(
 lesson_no integer NOT NULL REFERENCES public.professional_training_lessons(lesson_no),
 question_no integer NOT NULL CHECK (question_no BETWEEN 1 AND 20),
 question text NOT NULL,
 options jsonb NOT NULL CHECK (jsonb_typeof(options)='array' AND jsonb_array_length(options)=3),
 correct_index integer NOT NULL CHECK (correct_index BETWEEN 0 AND 2),
 PRIMARY KEY (lesson_no,question_no)
);
CREATE TABLE IF NOT EXISTS public.professional_training_progress(
 user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
 lesson_no integer NOT NULL REFERENCES public.professional_training_lessons(lesson_no),
 watch_completed boolean NOT NULL DEFAULT false,
 watch_completed_at timestamptz,
 best_score integer CHECK (best_score BETWEEN 0 AND 20),
 passed boolean NOT NULL DEFAULT false,
 passed_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (user_id,lesson_no)
);
CREATE TABLE IF NOT EXISTS public.professional_training_attempts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
 lesson_no integer NOT NULL REFERENCES public.professional_training_lessons(lesson_no),
 answers jsonb NOT NULL CHECK (jsonb_typeof(answers)='array' AND jsonb_array_length(answers)=20),
 score integer NOT NULL CHECK (score BETWEEN 0 AND 20),
 passed boolean NOT NULL,
 revision integer NOT NULL,
 submitted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS professional_training_attempts_user_idx
 ON public.professional_training_attempts(user_id,lesson_no,submitted_at DESC);

-- Same lessons, videos and trainers as professional-training-0N.js. Durations read from YouTube on 2026-10-15.
-- Questions and answer keys are NOT seeded: they are loaded privately with professional_training_import_bank.
-- Draft lesson 4 must not start a verified watch until the owner approves its quiz.
INSERT INTO public.professional_training_lessons(lesson_no,title,instructor,video_id,expected_duration_seconds,active) VALUES
 (1,'طريقة العمل مع DXN وأساسيات ومهارات هذا البزنس','م. محمود المصري','zO3U8yj0Sig',1164,true),
 (2,'عشر خطوات للعمل الاحترافي مع DXN','م. محمود المصري','tVim2H5Elck',157,true),
 (3,'فنون الدعوة ومهارات الاستقطاب مع DXN','م. محمود المصري','HOtDbw8-P3w',2718,true),
 (4,'معالجة الاعتراضات وأساليب الإقناع في DXN','م. محمود المصري','nzezoIaIRVg',2182,false),
 (5,'إعداد قائمة الأسماء الاحترافية','الأستاذ أحمد العتيبي','HxID9tMHoVw',5596,true)
ON CONFLICT (lesson_no) DO NOTHING;

-- ---------------------------------------------------------------- watch attempts (all tracks)
CREATE TABLE IF NOT EXISTS public.training_watch_attempts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
 track text NOT NULL CHECK (track IN ('basic','professional','advanced')),
 lesson_no integer NOT NULL CHECK (lesson_no>=1),
 expected_seconds integer NOT NULL CHECK (expected_seconds>=60),
 watched_seconds integer NOT NULL DEFAULT 0 CHECK (watched_seconds>=0),
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 last_report_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 ended_at timestamptz,
 end_reason text CHECK (end_reason IN ('completed','replaced','idle')),
 completed boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS training_watch_attempts_open_idx
 ON public.training_watch_attempts(user_id,track,lesson_no) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS training_watch_attempts_recent_idx
 ON public.training_watch_attempts(user_id,started_at DESC);

ALTER TABLE public.training_engine_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_watch_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_training_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_training_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_training_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_training_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.training_engine_settings,public.training_watch_attempts,
 public.professional_training_lessons,public.professional_training_questions,
 public.professional_training_progress,public.professional_training_attempts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.training_engine_settings,public.training_watch_attempts,
 public.professional_training_lessons,public.professional_training_questions,
 public.professional_training_progress,public.professional_training_attempts TO service_role;

-- ---------------------------------------------------------------- internal helpers (not exposed)
-- Lesson duration for a watch attempt, after the track's readiness and sequence checks.
CREATE OR REPLACE FUNCTION public.training_engine_lesson_seconds(p_user uuid,p_track text,p_lesson_no integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE v_seconds integer; v_prev_ok boolean;
BEGIN
 IF p_track='basic' THEN
   SELECT expected_duration_seconds INTO v_seconds FROM public.basic_training_lessons
   WHERE training_no=p_lesson_no AND active;
   IF NOT FOUND THEN RAISE EXCEPTION 'التدريب غير موجود'; END IF;
   v_prev_ok:=p_lesson_no=1 OR EXISTS(SELECT 1 FROM public.basic_training_progress
     WHERE user_id=p_user AND training_no=p_lesson_no-1 AND passed AND watch_completed);
 ELSIF p_track='advanced' THEN
   SELECT expected_duration_seconds INTO v_seconds FROM public.advanced_financial_lessons
   WHERE lesson_no=p_lesson_no AND active;
   IF NOT FOUND THEN RAISE EXCEPTION 'التدريب لم يُنشر بعد'; END IF;
   IF (SELECT count(*) FROM public.advanced_financial_questions WHERE lesson_no=p_lesson_no)<>20 THEN
     RAISE EXCEPTION 'بنك أسئلة التدريب غير مكتمل'; END IF;
   v_prev_ok:=p_lesson_no=1 OR EXISTS(SELECT 1 FROM public.advanced_financial_progress
     WHERE user_id=p_user AND lesson_no=p_lesson_no-1 AND passed AND watch_completed);
 ELSIF p_track='professional' THEN
   SELECT expected_duration_seconds INTO v_seconds FROM public.professional_training_lessons
   WHERE lesson_no=p_lesson_no AND active;
   IF NOT FOUND THEN RAISE EXCEPTION 'التدريب غير موجود'; END IF;
   v_prev_ok:=p_lesson_no=1 OR EXISTS(SELECT 1 FROM public.professional_training_progress
     WHERE user_id=p_user AND lesson_no=p_lesson_no-1 AND passed AND watch_completed);
 ELSE
   RAISE EXCEPTION 'مسار التدريب غير معروف';
 END IF;
 IF COALESCE(v_seconds,0)<60 THEN RAISE EXCEPTION 'مدة الفيديو لم تُعتمد بعد'; END IF;
 IF NOT v_prev_ok THEN RAISE EXCEPTION 'الدرس مغلق — أكمل الدرس السابق واجتز اختباره أولًا'; END IF;
 RETURN v_seconds;
END $fn$;

CREATE OR REPLACE FUNCTION public.training_engine_watch_completed(p_user uuid,p_track text,p_lesson_no integer)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
 SELECT CASE p_track
  WHEN 'basic' THEN EXISTS(SELECT 1 FROM public.basic_training_progress WHERE user_id=p_user AND training_no=p_lesson_no AND watch_completed)
  WHEN 'advanced' THEN EXISTS(SELECT 1 FROM public.advanced_financial_progress WHERE user_id=p_user AND lesson_no=p_lesson_no AND watch_completed)
  WHEN 'professional' THEN EXISTS(SELECT 1 FROM public.professional_training_progress WHERE user_id=p_user AND lesson_no=p_lesson_no AND watch_completed)
  ELSE false END
$fn$;

-- Records a completed attempt. Only ever sets watch_completed to true; scores and passes untouched.
CREATE OR REPLACE FUNCTION public.training_engine_mark_completed(p_user uuid,p_track text,p_lesson_no integer,p_seconds integer,p_watched integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
BEGIN
 IF p_track='basic' THEN
   INSERT INTO public.basic_training_progress(user_id,training_no,watch_seconds,duration_seconds,watch_completed)
   VALUES(p_user,p_lesson_no,p_watched,p_seconds,true)
   ON CONFLICT (user_id,training_no) DO UPDATE SET watch_completed=true,
     watch_seconds=GREATEST(public.basic_training_progress.watch_seconds,EXCLUDED.watch_seconds),
     duration_seconds=EXCLUDED.duration_seconds,updated_at=now();
 ELSIF p_track='advanced' THEN
   INSERT INTO public.advanced_financial_progress(user_id,lesson_no,watch_seconds,duration_seconds,watch_completed)
   VALUES(p_user,p_lesson_no,p_watched,p_seconds,true)
   ON CONFLICT (user_id,lesson_no) DO UPDATE SET watch_completed=true,
     watch_seconds=GREATEST(public.advanced_financial_progress.watch_seconds,EXCLUDED.watch_seconds),
     duration_seconds=EXCLUDED.duration_seconds,updated_at=now();
 ELSE
   INSERT INTO public.professional_training_progress(user_id,lesson_no,watch_completed,watch_completed_at)
   VALUES(p_user,p_lesson_no,true,now())
   ON CONFLICT (user_id,lesson_no) DO UPDATE SET watch_completed=true,
     watch_completed_at=COALESCE(public.professional_training_progress.watch_completed_at,now()),updated_at=now();
 END IF;
END $fn$;

-- ---------------------------------------------------------------- public engine RPCs
CREATE OR REPLACE FUNCTION public.training_engine_config(p_token uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE v_s public.training_engine_settings%rowtype;
BEGIN
 IF public.app_current_user_id(p_token) IS NULL THEN RAISE EXCEPTION 'انتهت الجلسة'; END IF;
 SELECT * INTO v_s FROM public.training_engine_settings WHERE id;
 RETURN jsonb_build_object('idle_timeout_seconds',v_s.idle_timeout_seconds,'watch_requirement',v_s.min_watch_percent,'pass_requirement',16);
END $fn$;

-- Starts a new watch attempt from 0 s; any open attempt for the same lesson stops counting.
CREATE OR REPLACE FUNCTION public.training_watch_begin(p_token uuid,p_track text,p_lesson_no integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE v_user uuid; v_seconds integer; v_id uuid; v_idle integer; v_now timestamptz:=clock_timestamp();
BEGIN
 v_user:=public.app_current_user_id(p_token);
 IF v_user IS NULL THEN RAISE EXCEPTION 'انتهت الجلسة، سجل الدخول مجددًا'; END IF;
 v_seconds:=public.training_engine_lesson_seconds(v_user,p_track,p_lesson_no);
 IF (SELECT count(*) FROM public.training_watch_attempts WHERE user_id=v_user AND started_at>v_now-interval '1 hour')>=60 THEN
   RAISE EXCEPTION 'عدد كبير من محاولات المشاهدة خلال ساعة؛ حاول لاحقًا'; END IF;
 SELECT idle_timeout_seconds INTO v_idle FROM public.training_engine_settings WHERE id;
 UPDATE public.training_watch_attempts SET ended_at=v_now,end_reason='replaced'
 WHERE user_id=v_user AND track=p_track AND lesson_no=p_lesson_no AND ended_at IS NULL;
 INSERT INTO public.training_watch_attempts(user_id,track,lesson_no,expected_seconds,started_at,last_report_at)
 VALUES(v_user,p_track,p_lesson_no,v_seconds,v_now,v_now) RETURNING id INTO v_id;
 RETURN jsonb_build_object('attempt_id',v_id,'track',p_track,'lesson_no',p_lesson_no,'duration',v_seconds,
   'watched',0,'percent',0,'attempt_completed',false,'expired',false,
   'watch_completed',public.training_engine_watch_completed(v_user,p_track,p_lesson_no),
   'idle_timeout_seconds',v_idle,'watch_requirement',90);
END $fn$;

-- Credits one report of the current attempt. At most ~1 s per real second (max 8 s per report), never
-- beyond the reported player position, never from another attempt or another account.
CREATE OR REPLACE FUNCTION public.training_watch_report(p_token uuid,p_attempt_id uuid,p_current integer,p_duration integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE v_user uuid; v_a public.training_watch_attempts%rowtype; v_idle integer;
        v_now timestamptz:=clock_timestamp(); v_gap double precision; v_budget integer;
        v_new integer; v_done boolean;
BEGIN
 v_user:=public.app_current_user_id(p_token);
 IF v_user IS NULL THEN RAISE EXCEPTION 'انتهت الجلسة، سجل الدخول مجددًا'; END IF;
 SELECT * INTO v_a FROM public.training_watch_attempts WHERE id=p_attempt_id FOR UPDATE;
 IF NOT FOUND OR v_a.user_id<>v_user THEN RAISE EXCEPTION 'جلسة المشاهدة غير صالحة'; END IF;
 IF v_a.ended_at IS NOT NULL THEN
   RETURN jsonb_build_object('attempt_id',v_a.id,'track',v_a.track,'lesson_no',v_a.lesson_no,
     'watched',v_a.watched_seconds,'duration',v_a.expected_seconds,
     'percent',floor(100.0*v_a.watched_seconds/v_a.expected_seconds),
     'attempt_completed',v_a.completed,'expired',NOT v_a.completed,'reason',v_a.end_reason,
     'watch_completed',public.training_engine_watch_completed(v_user,v_a.track,v_a.lesson_no));
 END IF;
 SELECT idle_timeout_seconds INTO v_idle FROM public.training_engine_settings WHERE id;
 v_gap:=extract(epoch FROM v_now-v_a.last_report_at);
 IF v_gap>v_idle THEN
   UPDATE public.training_watch_attempts SET ended_at=v_now,end_reason='idle' WHERE id=v_a.id;
   RETURN jsonb_build_object('attempt_id',v_a.id,'track',v_a.track,'lesson_no',v_a.lesson_no,
     'watched',v_a.watched_seconds,'duration',v_a.expected_seconds,
     'percent',floor(100.0*v_a.watched_seconds/v_a.expected_seconds),
     'attempt_completed',false,'expired',true,'reason','idle',
     'watch_completed',public.training_engine_watch_completed(v_user,v_a.track,v_a.lesson_no));
 END IF;
 -- Sequence and readiness are re-checked on every report.
 PERFORM public.training_engine_lesson_seconds(v_user,v_a.track,v_a.lesson_no);
 IF p_current IS NULL OR p_duration IS NULL OR p_current<0
    OR p_duration<v_a.expected_seconds*0.85 OR p_duration>v_a.expected_seconds*1.15
    OR p_current>p_duration+3 THEN
   RAISE EXCEPTION 'مدة الفيديو أو التقدم غير صحيح'; END IF;
 v_budget:=CASE WHEN v_gap<3 THEN 0 ELSE LEAST(8,floor(v_gap)::integer+1) END;
 v_new:=LEAST(v_a.expected_seconds,v_a.watched_seconds+LEAST(GREATEST(p_current-v_a.watched_seconds,0),v_budget));
 v_done:=v_new*100>=v_a.expected_seconds*90;
 UPDATE public.training_watch_attempts SET watched_seconds=v_new,last_report_at=v_now,completed=v_done,
   ended_at=CASE WHEN v_done THEN v_now END,end_reason=CASE WHEN v_done THEN 'completed' END
 WHERE id=v_a.id;
 IF v_done THEN
   PERFORM public.training_engine_mark_completed(v_user,v_a.track,v_a.lesson_no,v_a.expected_seconds,v_new);
 END IF;
 RETURN jsonb_build_object('attempt_id',v_a.id,'track',v_a.track,'lesson_no',v_a.lesson_no,
   'watched',v_new,'duration',v_a.expected_seconds,'percent',floor(100.0*v_new/v_a.expected_seconds),
   'attempt_completed',v_done,'expired',false,
   'watch_completed',v_done OR public.training_engine_watch_completed(v_user,v_a.track,v_a.lesson_no));
END $fn$;

-- ---------------------------------------------------------------- professional quiz RPCs
CREATE OR REPLACE FUNCTION public.professional_training_overview(p_token uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE v_user uuid; v_role text;
BEGIN
 v_user:=public.app_current_user_id(p_token);
 IF v_user IS NULL THEN RAISE EXCEPTION 'انتهت الجلسة، سجل الدخول مجددًا'; END IF;
 SELECT role INTO v_role FROM public.app_users WHERE id=v_user;
 RETURN jsonb_build_object('role',v_role,'watch_requirement',90,'pass_requirement',16,'lessons',(
   SELECT COALESCE(jsonb_agg(jsonb_build_object(
     'lesson_no',l.lesson_no,'title',l.title,'instructor',l.instructor,'video_id',l.video_id,
     'duration',l.expected_duration_seconds,'active',l.active,
     'published',(SELECT count(*)=20 FROM public.professional_training_questions q WHERE q.lesson_no=l.lesson_no),
     'completed',COALESCE(p.watch_completed,false),'best_score',p.best_score,
     'passed',COALESCE(p.passed,false),'passed_at',p.passed_at
   ) ORDER BY l.lesson_no),'[]'::jsonb)
   FROM public.professional_training_lessons l
   LEFT JOIN public.professional_training_progress p ON p.user_id=v_user AND p.lesson_no=l.lesson_no
   -- Return inactive lessons too so members see that a lesson awaits owner approval.
   ));
END $fn$;

CREATE OR REPLACE FUNCTION public.professional_training_get_quiz(p_token uuid,p_lesson_no integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE v_user uuid; v_rev integer; v_list jsonb;
BEGIN
 v_user:=public.app_current_user_id(p_token);
 IF v_user IS NULL THEN RAISE EXCEPTION 'انتهت الجلسة'; END IF;
 SELECT revision INTO v_rev FROM public.professional_training_lessons WHERE lesson_no=p_lesson_no AND active;
 IF NOT FOUND THEN RAISE EXCEPTION 'التدريب غير موجود'; END IF;
 IF p_lesson_no>1 AND NOT EXISTS(SELECT 1 FROM public.professional_training_progress
   WHERE user_id=v_user AND lesson_no=p_lesson_no-1 AND passed AND watch_completed)
 THEN RAISE EXCEPTION 'الدرس مغلق — أكمل الدرس السابق واجتز اختباره أولًا'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.professional_training_progress
   WHERE user_id=v_user AND lesson_no=p_lesson_no AND watch_completed)
 THEN RAISE EXCEPTION 'أكمل مشاهدة 90%% من الفيديو أولًا'; END IF;
 SELECT jsonb_agg(jsonb_build_object('no',question_no,'question',question,'options',options) ORDER BY question_no)
 INTO v_list FROM public.professional_training_questions WHERE lesson_no=p_lesson_no;
 IF jsonb_array_length(COALESCE(v_list,'[]'::jsonb))<>20 THEN RAISE EXCEPTION 'اختبار هذا الدرس قيد الاعتماد'; END IF;
 RETURN jsonb_build_object('revision',v_rev,'questions',v_list);
END $fn$;

CREATE OR REPLACE FUNCTION public.professional_training_submit_quiz(p_token uuid,p_lesson_no integer,p_answers jsonb,p_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE v_user uuid; v_rev integer; v_p public.professional_training_progress%rowtype;
        v_count integer; v_score integer; v_pass boolean; v_best integer; v_i integer; v_recent integer;
BEGIN
 v_user:=public.app_current_user_id(p_token);
 IF v_user IS NULL THEN RAISE EXCEPTION 'انتهت الجلسة'; END IF;
 SELECT revision INTO v_rev FROM public.professional_training_lessons WHERE lesson_no=p_lesson_no AND active FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'التدريب غير موجود'; END IF;
 IF p_revision IS DISTINCT FROM v_rev THEN RAISE EXCEPTION 'تم تحديث الاختبار؛ أعد فتحه'; END IF;
 IF p_lesson_no>1 AND NOT EXISTS(SELECT 1 FROM public.professional_training_progress
   WHERE user_id=v_user AND lesson_no=p_lesson_no-1 AND passed AND watch_completed)
 THEN RAISE EXCEPTION 'الدرس مغلق — أكمل الدرس السابق واجتز اختباره أولًا'; END IF;
 SELECT * INTO v_p FROM public.professional_training_progress WHERE user_id=v_user AND lesson_no=p_lesson_no FOR UPDATE;
 IF NOT FOUND OR NOT v_p.watch_completed THEN RAISE EXCEPTION 'أكمل مشاهدة 90%% من الفيديو قبل الاختبار'; END IF;
 -- Same retake limit as the basic track: 6 per hour.
 SELECT count(*) INTO v_recent FROM public.professional_training_attempts
 WHERE user_id=v_user AND lesson_no=p_lesson_no AND submitted_at>now()-interval '1 hour';
 IF v_recent>=6 THEN RAISE EXCEPTION 'وصلت إلى الحد المؤقت للمحاولات (6 خلال ساعة). حاول لاحقًا'; END IF;
 IF p_answers IS NULL OR jsonb_typeof(p_answers)<>'array' OR jsonb_array_length(p_answers)<>20 THEN
   RAISE EXCEPTION 'يجب إجابة جميع الأسئلة العشرين'; END IF;
 FOR v_i IN 0..19 LOOP
   IF jsonb_typeof(p_answers->v_i)<>'number' OR (p_answers->>v_i) NOT IN ('0','1','2') THEN
     RAISE EXCEPTION 'الإجابات يجب أن تكون من الخيارات الثلاثة'; END IF;
 END LOOP;
 SELECT count(*),count(*) FILTER (WHERE (p_answers->>(q.question_no-1))::integer=q.correct_index)
 INTO v_count,v_score FROM public.professional_training_questions q WHERE q.lesson_no=p_lesson_no;
 IF v_count<>20 THEN RAISE EXCEPTION 'اختبار هذا الدرس قيد الاعتماد'; END IF;
 v_pass:=v_score>=16;
 INSERT INTO public.professional_training_attempts(user_id,lesson_no,answers,score,passed,revision)
 VALUES(v_user,p_lesson_no,p_answers,v_score,v_pass,v_rev);
 v_best:=GREATEST(COALESCE(v_p.best_score,0),v_score);
 UPDATE public.professional_training_progress SET best_score=v_best,passed=passed OR v_pass,
   passed_at=CASE WHEN v_pass AND passed_at IS NULL THEN now() ELSE passed_at END,updated_at=now()
 WHERE user_id=v_user AND lesson_no=p_lesson_no;
 RETURN jsonb_build_object('score',v_score,'out_of',20,'passed',v_pass,'best_score',v_best,'required',16,'revision',v_rev);
END $fn$;

-- Private import of one lesson's 20 approved questions with their keys. Service role only;
-- refuses to replace a bank once members have submitted attempts for that lesson.
CREATE OR REPLACE FUNCTION public.professional_training_import_bank(p_lesson_no integer,p_questions jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $fn$
DECLARE v_i integer; v_q jsonb;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'هذه الوظيفة محصورة بخادم الاستيراد الخاص'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.professional_training_lessons WHERE lesson_no=p_lesson_no) THEN
   RAISE EXCEPTION 'الدرس غير موجود'; END IF;
 IF EXISTS(SELECT 1 FROM public.professional_training_attempts WHERE lesson_no=p_lesson_no) THEN
   RAISE EXCEPTION 'يوجد محاولات للأعضاء؛ لا يُستبدل بنك الأسئلة'; END IF;
 IF p_questions IS NULL OR jsonb_typeof(p_questions)<>'array' OR jsonb_array_length(p_questions)<>20 THEN
   RAISE EXCEPTION 'يلزم 20 سؤالًا'; END IF;
 FOR v_i IN 0..19 LOOP
   v_q:=p_questions->v_i;
   IF (v_q->>'no')::integer<>v_i+1 OR length(btrim(v_q->>'question'))<3
      OR jsonb_typeof(v_q->'options')<>'array' OR jsonb_array_length(v_q->'options')<>3
      OR (v_q->>'correct_index')::integer NOT BETWEEN 0 AND 2 THEN
     RAISE EXCEPTION 'السؤال % غير صالح',v_i+1; END IF;
 END LOOP;
 DELETE FROM public.professional_training_questions WHERE lesson_no=p_lesson_no;
 INSERT INTO public.professional_training_questions(lesson_no,question_no,question,options,correct_index)
 SELECT p_lesson_no,(x->>'no')::integer,x->>'question',x->'options',(x->>'correct_index')::integer
 FROM jsonb_array_elements(p_questions) x;
 RETURN jsonb_build_object('lesson_no',p_lesson_no,'questions',20);
END $fn$;

-- ---------------------------------------------------------------- grants
REVOKE ALL ON FUNCTION public.training_engine_lesson_seconds(uuid,text,integer),
 public.training_engine_watch_completed(uuid,text,integer),
 public.training_engine_mark_completed(uuid,text,integer,integer,integer),
 public.professional_training_import_bank(integer,jsonb)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.professional_training_import_bank(integer,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.training_engine_config(uuid),
 public.training_watch_begin(uuid,text,integer),
 public.training_watch_report(uuid,uuid,integer,integer),
 public.professional_training_overview(uuid),
 public.professional_training_get_quiz(uuid,integer),
 public.professional_training_submit_quiz(uuid,integer,jsonb,integer)
 FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.training_engine_config(uuid),
 public.training_watch_begin(uuid,text,integer),
 public.training_watch_report(uuid,uuid,integer,integer),
 public.professional_training_overview(uuid),
 public.professional_training_get_quiz(uuid,integer),
 public.professional_training_submit_quiz(uuid,integer,jsonb,integer)
 TO anon,authenticated,service_role;

COMMIT;
