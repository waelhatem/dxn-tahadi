-- PENDING REVIEW: DO NOT APPLY TO PRODUCTION BEFORE VIDEO RESUME TESTS.
-- Additive support for the basic, professional and advanced training tracks.
-- The pre-existing training_watch_begin and training_watch_report remain unchanged.
-- Rollout: deploy this SQL before frontend; the frontend falls back to the legacy
-- endpoint when this one is not yet available.
--
-- Security invariants:
-- * Uses the original authenticated training_watch_begin, including every access,
--   prerequisites, limit, session and watch-completion check.
-- * Resumes only the greatest previously SERVER-CONFIRMED contiguous second
--   for the SAME user, SAME track, SAME lesson and SAME video/duration.
-- * No sums across unrelated attempts; no forward skipping and no quiz bypass.
-- * Existing passes, scores, lesson completion and quiz results are untouched.
BEGIN;

ALTER TABLE public.training_watch_attempts
  ADD COLUMN IF NOT EXISTS source_video_id text;

CREATE OR REPLACE FUNCTION public.training_watch_begin_resume(
  p_token uuid, p_track text, p_lesson_no integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE
  v_begin jsonb;
  v_user uuid;
  v_id uuid;
  v_duration integer;
  v_resume integer := 0;
  v_video text;
  v_already_completed boolean;
BEGIN
  -- Important: the existing function performs all authorization, track-gating
  -- and rate limiting; never circumvent it.
  v_begin := public.training_watch_begin(p_token,p_track,p_lesson_no);
  v_user := public.app_current_user_id(p_token);
  IF v_user IS NULL THEN RAISE EXCEPTION 'انتهت الجلسة؛ سجّل الدخول مجدداً'; END IF;
  v_id := (v_begin->>'attempt_id')::uuid;
  v_duration := (v_begin->>'duration')::integer;
  v_already_completed := COALESCE((v_begin->>'watch_completed')::boolean,false);

  IF p_track='basic' THEN
    SELECT video_id INTO v_video
    FROM public.basic_training_lessons WHERE training_no=p_lesson_no;
  ELSIF p_track='professional' THEN
    SELECT video_id INTO v_video
    FROM public.professional_training_lessons WHERE lesson_no=p_lesson_no;
  ELSIF p_track='advanced' THEN
    SELECT video_id INTO v_video
    FROM public.advanced_financial_lessons WHERE lesson_no=p_lesson_no;
  END IF;
  IF v_video IS NULL OR v_video !~ '^[A-Za-z0-9_-]{11}$' THEN
    RAISE EXCEPTION 'معرّف فيديو التدريب غير صالح';
  END IF;

  -- Legacy rows (NULL source_video_id) can be resumed by the same lesson and
  -- duration once, while all future rows are pinned to the actual YouTube ID.
  IF NOT v_already_completed THEN
    SELECT COALESCE(MAX(watched_seconds),0) INTO v_resume
    FROM public.training_watch_attempts
    WHERE user_id=v_user
      AND track=p_track
      AND lesson_no=p_lesson_no
      AND expected_seconds=v_duration
      AND id<>v_id
      AND (source_video_id=v_video OR source_video_id IS NULL)
      AND watched_seconds*100 < expected_seconds*90;
    -- Do not mark the 90% threshold complete merely by resuming.
    v_resume := GREATEST(0,LEAST(v_resume,CEIL(v_duration*0.9)::integer-1));
  END IF;

  UPDATE public.training_watch_attempts
  SET source_video_id=v_video,watched_seconds=v_resume
  WHERE id=v_id AND user_id=v_user;

  RETURN v_begin || jsonb_build_object(
    'watched',v_resume,
    'percent',floor(100.0*v_resume/v_duration),
    'resume_seconds',v_resume
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.training_watch_begin_resume(uuid,text,integer)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.training_watch_begin_resume(uuid,text,integer)
  TO anon,authenticated,service_role;
COMMIT;
