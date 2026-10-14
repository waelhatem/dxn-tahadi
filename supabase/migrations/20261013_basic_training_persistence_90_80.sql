-- Staged only. DO NOT apply to production without separate authorization.
-- The legacy training_lessons, training_progress, training_questions, and
-- training_answers tables belong to the existing non-basic training flow.
-- Store eight basic lessons, approved quizzes and member results separately.
BEGIN;

CREATE TABLE IF NOT EXISTS public.basic_training_lessons (
 training_no integer PRIMARY KEY CHECK (training_no BETWEEN 1 AND 8),
 title text NOT NULL,
 video_id text NOT NULL CHECK (video_id ~ '^[A-Za-z0-9_-]{11}$'),
 expected_duration_seconds integer NOT NULL CHECK (expected_duration_seconds BETWEEN 60 AND 14400),
 min_watch_percent integer NOT NULL DEFAULT 90 CHECK (min_watch_percent BETWEEN 1 AND 100),
 pass_score integer NOT NULL DEFAULT 16 CHECK (pass_score BETWEEN 1 AND 20),
 active boolean NOT NULL DEFAULT true,
 active_revision integer NOT NULL DEFAULT 1 CHECK (active_revision>=1),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.basic_training_questions (
 training_no integer NOT NULL REFERENCES public.basic_training_lessons(training_no),
 question_no integer NOT NULL CHECK (question_no BETWEEN 1 AND 20),
 question text NOT NULL,
 options jsonb NOT NULL CHECK (jsonb_typeof(options)='array' AND jsonb_array_length(options)=3),
 correct_index integer NOT NULL CHECK (correct_index BETWEEN 0 AND 2),
 source_time text NOT NULL DEFAULT '',
 PRIMARY KEY (training_no, question_no)
);

CREATE TABLE IF NOT EXISTS public.basic_training_progress (
 user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
 training_no integer NOT NULL REFERENCES public.basic_training_lessons(training_no),
 watch_seconds integer NOT NULL DEFAULT 0 CHECK (watch_seconds>=0),
 duration_seconds integer NOT NULL DEFAULT 0 CHECK (duration_seconds>=0),
 watch_completed boolean NOT NULL DEFAULT false,
 best_score integer CHECK (best_score BETWEEN 0 AND 20),
 passed boolean NOT NULL DEFAULT false,
 passed_at timestamptz,
 last_report_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (user_id, training_no)
);

CREATE TABLE IF NOT EXISTS public.basic_training_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
 training_no integer NOT NULL REFERENCES public.basic_training_lessons(training_no),
 answers jsonb NOT NULL CHECK (jsonb_typeof(answers)='array' AND jsonb_array_length(answers)=20),
 score integer NOT NULL CHECK (score BETWEEN 0 AND 20),
 passed boolean NOT NULL DEFAULT false,
 revision integer NOT NULL DEFAULT 1 CHECK (revision>=1),
 submitted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS basic_training_attempts_user_history
 ON public.basic_training_attempts (user_id,training_no,submitted_at DESC);

-- RLS alone is not enough for public anon-key access: remove table grants.
ALTER TABLE public.basic_training_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.basic_training_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.basic_training_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.basic_training_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.basic_training_lessons,public.basic_training_questions,
 public.basic_training_progress,public.basic_training_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.basic_training_lessons,public.basic_training_questions,
 public.basic_training_progress,public.basic_training_attempts TO service_role;

-- All user scope is resolved from the existing UUID session, not client member IDs.
CREATE OR REPLACE FUNCTION public.basic_training_overview(p_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE v_user uuid; v_role text;
BEGIN
 v_user:=public.app_current_user_id(p_token);
 IF v_user IS NULL THEN RAISE EXCEPTION 'انتهت الجلسة، سجل الدخول مجددًا'; END IF;
 SELECT u.role INTO v_role FROM public.app_users u WHERE u.id=v_user;
 RETURN jsonb_build_object(
 'role',v_role,
 'progress', (
   SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'training_no',l.training_no,'watched',COALESCE(p.watch_seconds,0),
    'duration',l.expected_duration_seconds,
    'completed',COALESCE(p.watch_completed,false),
    'passed',COALESCE(p.passed,false),'best_score',p.best_score,
    'passed_at',p.passed_at
   ) ORDER BY l.training_no),'[]'::jsonb)
   FROM public.basic_training_lessons l
   LEFT JOIN public.basic_training_progress p ON p.training_no=l.training_no AND p.user_id=v_user
   WHERE l.active
 ),
 'scores', (
   SELECT COALESCE(jsonb_agg(jsonb_build_object('training_no',p.training_no,
    'score',p.best_score,'passed',p.passed,'passed_at',p.passed_at)
    ORDER BY p.training_no),'[]'::jsonb)
   FROM public.basic_training_progress p WHERE p.user_id=v_user AND p.best_score IS NOT NULL
 ),
 'published_quizzes',(
   SELECT COALESCE(jsonb_agg(l.training_no ORDER BY l.training_no),'[]'::jsonb)
   FROM public.basic_training_lessons l WHERE l.active
     AND (SELECT count(*) FROM public.basic_training_questions q WHERE q.training_no=l.training_no)=20
 ),
 'watch_requirement',90,'pass_requirement',16);
END $fn$;

-- Server credits at most real-time-sized intervals and never accepts leaps.
-- YouTube playback is not cryptographically attestable; this is a best-effort
-- guard complemented by client seek prevention.
CREATE OR REPLACE FUNCTION public.basic_training_watch_update(
 p_token uuid,p_training_no integer,p_current integer,p_duration integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE v_user uuid; v_l public.basic_training_lessons%rowtype;
        v_p public.basic_training_progress%rowtype;
        v_now timestamptz:=clock_timestamp(); v_gap double precision;
        v_budget integer; v_added integer; v_new integer; v_done boolean;
BEGIN
 v_user:=public.app_current_user_id(p_token);
 IF v_user IS NULL THEN RAISE EXCEPTION 'انتهت الجلسة'; END IF;
 SELECT * INTO v_l FROM public.basic_training_lessons WHERE training_no=p_training_no AND active;
 IF NOT FOUND THEN RAISE EXCEPTION 'التدريب غير موجود'; END IF;
 IF v_l.training_no>1 AND NOT EXISTS (
   SELECT 1 FROM public.basic_training_progress WHERE user_id=v_user
     AND training_no=v_l.training_no-1 AND passed AND watch_completed
 ) THEN RAISE EXCEPTION 'أكمل التدريب السابق واجتز اختباره أولًا'; END IF;
 IF p_current IS NULL OR p_duration IS NULL OR p_current<0
   OR p_duration < v_l.expected_duration_seconds*0.85
   OR p_duration > v_l.expected_duration_seconds*1.15
   OR p_current > p_duration+3
 THEN RAISE EXCEPTION 'مدة الفيديو أو التقدم غير صحيح'; END IF;
 INSERT INTO public.basic_training_progress(user_id,training_no,duration_seconds)
 VALUES (v_user,p_training_no,v_l.expected_duration_seconds)
 ON CONFLICT (user_id,training_no) DO NOTHING;
 SELECT * INTO v_p FROM public.basic_training_progress
 WHERE user_id=v_user AND training_no=p_training_no FOR UPDATE;
 v_gap:=CASE WHEN v_p.last_report_at IS NULL THEN 5
  ELSE EXTRACT(EPOCH FROM (v_now-v_p.last_report_at)) END;
 v_budget:=CASE WHEN v_p.last_report_at IS NULL THEN 5
  WHEN v_gap<3 THEN 0 ELSE LEAST(8,FLOOR(v_gap)::integer+1) END;
 v_added:=LEAST(GREATEST(p_current-v_p.watch_seconds,0),v_budget);
 v_new:=LEAST(v_l.expected_duration_seconds,v_p.watch_seconds+v_added);
 v_done:=v_new*100 >= v_l.expected_duration_seconds*v_l.min_watch_percent;
 UPDATE public.basic_training_progress SET
   watch_seconds=v_new, duration_seconds=v_l.expected_duration_seconds,
   watch_completed=watch_completed OR v_done,
   last_report_at=v_now, updated_at=v_now
 WHERE user_id=v_user AND training_no=p_training_no;
 RETURN jsonb_build_object('training_no',p_training_no,'watched',v_new,
    'duration',v_l.expected_duration_seconds,'completed',v_done,
    'percent',round(100.0*v_new/v_l.expected_duration_seconds,1));
END $fn$;

CREATE OR REPLACE FUNCTION public.basic_training_get_quiz(p_token uuid,p_training_no integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE v_user uuid; v_count integer; v_out jsonb; v_revision integer;
BEGIN
 v_user:=public.app_current_user_id(p_token);
 IF v_user IS NULL THEN RAISE EXCEPTION 'انتهت الجلسة'; END IF;
 SELECT l.active_revision INTO v_revision FROM public.basic_training_lessons l
 WHERE l.training_no=p_training_no AND l.active FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'التدريب غير موجود'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.basic_training_progress
     WHERE user_id=v_user AND training_no=p_training_no AND watch_completed)
 THEN RAISE EXCEPTION 'أكمل مشاهدة 90%% من الفيديو أولًا'; END IF;
 IF p_training_no>1 AND NOT EXISTS (
   SELECT 1 FROM public.basic_training_progress WHERE user_id=v_user
   AND training_no=p_training_no-1 AND passed AND watch_completed)
 THEN RAISE EXCEPTION 'أكمل التدريب السابق أولًا'; END IF;
 SELECT count(*), jsonb_agg(jsonb_build_object('no',q.question_no,
   'question',q.question,'options',q.options) ORDER BY q.question_no)
 INTO v_count,v_out FROM public.basic_training_questions q WHERE q.training_no=p_training_no;
 IF v_count<>20 THEN RAISE EXCEPTION 'أسئلة التدريب غير مكتملة'; END IF;
 RETURN jsonb_build_object('revision',v_revision,'questions',v_out);
END $fn$;

CREATE OR REPLACE FUNCTION public.basic_training_submit_quiz(
 p_token uuid,p_training_no integer,p_answers jsonb,p_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE v_user uuid; v_p public.basic_training_progress%rowtype;
        v_req integer; v_count integer; v_score integer; v_pass boolean;
        v_i integer; v_best integer; v_attempt_count integer; v_revision integer;
BEGIN
 v_user:=public.app_current_user_id(p_token);
 IF v_user IS NULL THEN RAISE EXCEPTION 'انتهت الجلسة'; END IF;
 SELECT l.pass_score,l.active_revision INTO v_req,v_revision
 FROM public.basic_training_lessons l
 WHERE l.training_no=p_training_no AND l.active FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'التدريب غير موجود'; END IF;
 IF p_revision IS DISTINCT FROM v_revision THEN
   RAISE EXCEPTION 'تم تحديث الاختبار أثناء الإجابة؛ أعد فتح الاختبار للحصول على النسخة الجديدة';
 END IF;
 IF p_training_no>1 AND NOT EXISTS (
    SELECT 1 FROM public.basic_training_progress WHERE user_id=v_user
     AND training_no=p_training_no-1 AND passed AND watch_completed)
 THEN RAISE EXCEPTION 'أكمل التدريب السابق أولًا'; END IF;
 SELECT * INTO v_p FROM public.basic_training_progress
 WHERE user_id=v_user AND training_no=p_training_no FOR UPDATE;
 IF NOT FOUND OR NOT v_p.watch_completed THEN
   RAISE EXCEPTION 'أكمل مشاهدة 90%% من الفيديو قبل الاختبار'; END IF;
 -- Bound score-oracle guessing without preventing legitimate exam retakes.
 -- Existing row lock on basic_training_progress serializes submissions.
 SELECT count(*) INTO v_attempt_count FROM public.basic_training_attempts a
 WHERE a.user_id=v_user AND a.training_no=p_training_no
   AND a.submitted_at > now() - interval '1 hour';
 IF v_attempt_count>=6 THEN
   RAISE EXCEPTION 'وصلت إلى الحد المؤقت للمحاولات (6 خلال ساعة). حاول لاحقًا'; END IF;
 IF p_answers IS NULL OR jsonb_typeof(p_answers)<>'array'
    OR jsonb_array_length(p_answers)<>20 THEN
    RAISE EXCEPTION 'يجب إجابة جميع الأسئلة العشرين'; END IF;
 FOR v_i IN 0..19 LOOP
   IF jsonb_typeof(p_answers->v_i)<>'number'
      OR (p_answers->>v_i) NOT IN ('0','1','2') THEN
      RAISE EXCEPTION 'الإجابات يجب أن تكون من الخيارات الثلاثة'; END IF;
 END LOOP;
 SELECT count(*), count(*) FILTER (
  WHERE (p_answers->>(q.question_no-1))::integer=q.correct_index
 ) INTO v_count,v_score FROM public.basic_training_questions q
 WHERE q.training_no=p_training_no;
 IF v_count<>20 THEN RAISE EXCEPTION 'أسئلة التدريب غير مكتملة'; END IF;
 v_pass:=v_score>=v_req;
 INSERT INTO public.basic_training_attempts(user_id,training_no,answers,score,passed,revision)
 VALUES(v_user,p_training_no,p_answers,v_score,v_pass,v_revision);
 v_best:=GREATEST(COALESCE(v_p.best_score,0),v_score);
 UPDATE public.basic_training_progress SET
  best_score=v_best,passed=passed OR v_pass,
  passed_at=CASE WHEN v_pass AND passed_at IS NULL THEN now() ELSE passed_at END,
  updated_at=now()
 WHERE user_id=v_user AND training_no=p_training_no;
 -- Only aggregate scores and pass status are returned to members.
 -- Never disclose correct_index, per-question correctness, or answer arrays.
 RETURN jsonb_build_object('score',v_score,'out_of',20,'passed',v_pass,
     'best_score',v_best,'required',v_req,'revision',v_revision);
END $fn$;

-- Revoke default EXECUTE from PUBLIC, then grant only session-bound RPC access.
REVOKE ALL ON FUNCTION public.basic_training_overview(uuid),
 public.basic_training_watch_update(uuid,integer,integer,integer),
 public.basic_training_get_quiz(uuid,integer),
 public.basic_training_submit_quiz(uuid,integer,jsonb,integer)
 FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.basic_training_overview(uuid),
 public.basic_training_watch_update(uuid,integer,integer,integer),
 public.basic_training_get_quiz(uuid,integer),
 public.basic_training_submit_quiz(uuid,integer,jsonb,integer)
 TO anon, authenticated, service_role;

COMMIT;
