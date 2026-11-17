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

-- Playback bookmarks are independent from the verified 90% assessment progress.
-- A member who has already unlocked the quiz can return to the final minute.
CREATE TABLE IF NOT EXISTS public.training_video_positions(
 user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
 track text NOT NULL CHECK (track IN ('basic','professional','advanced')),
 lesson_no integer NOT NULL CHECK (lesson_no>=1),
 source_video_id text NOT NULL,
 position_seconds integer NOT NULL DEFAULT 0 CHECK (position_seconds>=0),
 duration_seconds integer NOT NULL CHECK (duration_seconds>=60),
 finished boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(user_id,track,lesson_no,source_video_id)
);
ALTER TABLE public.training_video_positions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.training_video_positions FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.training_video_positions TO service_role;

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
  v_playback integer := 0;
  v_video text;
  v_position integer;
  v_finished boolean;
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
    v_playback := v_resume;
  ELSE
    -- Once the watch requirement is complete, resume the actual playback
    -- position (even beyond 90%) without giving any extra watched credit.
    SELECT position_seconds,finished INTO v_position,v_finished
    FROM public.training_video_positions
    WHERE user_id=v_user AND track=p_track AND lesson_no=p_lesson_no
      AND source_video_id=v_video AND duration_seconds=v_duration;
    IF FOUND THEN
      v_playback := CASE WHEN v_finished THEN 0
        ELSE LEAST(v_position,GREATEST(v_duration-4,0)) END;
    ELSE
      -- Previously completed lessons have no bookmark yet. Approximate the
      -- stopping point from the last server-confirmed completion to avoid
      -- forcing members to rewatch 90% just to see the final minutes.
      SELECT COALESCE(MAX(watched_seconds),0) INTO v_playback
      FROM public.training_watch_attempts
      WHERE user_id=v_user AND track=p_track AND lesson_no=p_lesson_no
        AND expected_seconds=v_duration AND id<>v_id AND completed
        AND (source_video_id=v_video OR source_video_id IS NULL);
      v_playback := GREATEST(0,LEAST(v_playback,v_duration-4));
    END IF;
  END IF;

  UPDATE public.training_watch_attempts
  SET source_video_id=v_video,watched_seconds=v_resume
  WHERE id=v_id AND user_id=v_user;

  RETURN v_begin || jsonb_build_object(
    'watched',v_resume,
    'percent',floor(100.0*v_resume/v_duration),
    'resume_seconds',v_playback
  );
END
$fn$;

-- Updating a bookmark does not award watched seconds or change an exam.
-- The client can seek freely in a completed video; for incomplete lessons the
-- resume function deliberately ignores bookmarks and uses verified attempts.
CREATE OR REPLACE FUNCTION public.training_video_bookmark(
 p_token uuid,p_track text,p_lesson_no integer,p_position integer,p_duration integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE
 v_user uuid;
 v_duration integer;
 v_video text;
 v_finished boolean;
BEGIN
 v_user:=public.app_current_user_id(p_token);
 IF v_user IS NULL THEN RAISE EXCEPTION 'انتهت الجلسة'; END IF;
 v_duration:=public.training_engine_lesson_seconds(v_user,p_track,p_lesson_no);
 IF p_position IS NULL OR p_duration IS NULL OR p_position<0
   OR p_duration<v_duration*0.85 OR p_duration>v_duration*1.15
   OR p_position>p_duration+3 THEN
   RAISE EXCEPTION 'بيانات موضع الفيديو غير صالحة';
 END IF;
 IF p_track='basic' THEN
   SELECT video_id INTO v_video FROM public.basic_training_lessons WHERE training_no=p_lesson_no;
 ELSIF p_track='professional' THEN
   SELECT video_id INTO v_video FROM public.professional_training_lessons WHERE lesson_no=p_lesson_no;
 ELSIF p_track='advanced' THEN
   SELECT video_id INTO v_video FROM public.advanced_financial_lessons WHERE lesson_no=p_lesson_no;
 END IF;
 IF v_video IS NULL THEN RAISE EXCEPTION 'الفيديو غير موجود'; END IF;
 v_finished := p_position>=p_duration-2;
 INSERT INTO public.training_video_positions(
   user_id,track,lesson_no,source_video_id,position_seconds,duration_seconds,finished,updated_at
 ) VALUES (
   v_user,p_track,p_lesson_no,v_video,
   CASE WHEN v_finished THEN 0 ELSE LEAST(p_position,v_duration-1) END,
   v_duration,v_finished,clock_timestamp()
 )
 ON CONFLICT(user_id,track,lesson_no,source_video_id)
 DO UPDATE SET position_seconds=EXCLUDED.position_seconds,
  duration_seconds=EXCLUDED.duration_seconds,finished=EXCLUDED.finished,
  updated_at=EXCLUDED.updated_at;
 RETURN jsonb_build_object('ok',true,'finished',v_finished);
END
$fn$;

REVOKE ALL ON FUNCTION public.training_video_bookmark(uuid,text,integer,integer,integer)
 FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.training_video_bookmark(uuid,text,integer,integer,integer)
 TO anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public.training_watch_begin_resume(uuid,text,integer)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.training_watch_begin_resume(uuid,text,integer)
  TO anon,authenticated,service_role;
COMMIT;
