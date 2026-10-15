-- PENDING REVIEW — do not apply without the project owner's explicit approval.
--
-- Problem: three basic trainings store a video duration that does not match the real YouTube video
-- (checked against YouTube on 2026-10-15). The server measures 90% against the stored value, so:
--   training 2  K_N80xZlxXw  stored 503 s, real 439 s  -> a full watch reaches only 87%, quiz never opens
--   training 6  G09ztpXOBBM  stored 838 s, real 1474 s -> every watch update is rejected (duration check)
--   training 7  kYJjJu2JQFI  stored 1175 s, real 450 s -> every watch update is rejected (duration check)
-- The leader editor cannot fix it: publishing a new duration is refused once any progress exists.
--
-- What this changes (data only; no table, function, policy or grant changes):
--   1. basic_training_lessons.expected_duration_seconds for trainings 2, 6, 7 (only if the row still has
--      the old wrong value and the same video), and the same value in the active revision row.
--   2. basic_training_progress.duration_seconds for those trainings (display only).
-- Revised 2026-10-15 for the unified training engine policy: watching counts per attempt only, so this fix
-- does NOT mark anyone as completed from earlier, cumulative watch time. A member who watched training 2
-- before must watch it again in one attempt (90% of the corrected 439 s) to open its quiz.
-- What it does not touch: watch_completed, watch_seconds, passed, best_score, attempts, scores, questions,
-- other trainings.
--
-- Step 0 (read-only, run first and keep the output): current values, and how many partial records exist.
--   SELECT training_no, video_id, expected_duration_seconds, min_watch_percent, active_revision
--   FROM public.basic_training_lessons WHERE training_no IN (2,6,7) ORDER BY training_no;
--   SELECT p.training_no, count(*) AS rows, count(*) FILTER (WHERE p.watch_completed) AS completed_now,
--          count(*) FILTER (WHERE NOT p.watch_completed) AS partial_only
--   FROM public.basic_training_progress p
--   JOIN public.basic_training_lessons l USING (training_no)
--   JOIN (VALUES (2,439),(6,1474),(7,450)) f(training_no,real_seconds) USING (training_no)
--   GROUP BY p.training_no ORDER BY p.training_no;
--
-- Rollback (durations only):
--   UPDATE public.basic_training_lessons l SET expected_duration_seconds=o.old_seconds, updated_at=now()
--   FROM (VALUES (2,503),(6,838),(7,1175)) o(training_no,old_seconds) WHERE l.training_no=o.training_no;
--   (and the same values in basic_training_revisions for each training's active_revision)

BEGIN;

CREATE TEMP TABLE basic_duration_fix(training_no integer PRIMARY KEY, video_id text, old_seconds integer, real_seconds integer) ON COMMIT DROP;
INSERT INTO basic_duration_fix VALUES
 (2,'K_N80xZlxXw',503,439),
 (6,'G09ztpXOBBM',838,1474),
 (7,'kYJjJu2JQFI',1175,450);

-- Stop if a lesson has already been changed by someone else (different video or value).
DO $$
DECLARE v_bad text;
BEGIN
 SELECT string_agg(f.training_no::text, ', ') INTO v_bad
 FROM basic_duration_fix f
 LEFT JOIN public.basic_training_lessons l ON l.training_no=f.training_no
 WHERE l.training_no IS NULL OR l.video_id<>f.video_id
    OR l.expected_duration_seconds NOT IN (f.old_seconds, f.real_seconds);
 IF v_bad IS NOT NULL THEN
   RAISE EXCEPTION 'Unexpected lesson data for training(s) %; nothing changed', v_bad;
 END IF;
END $$;

UPDATE public.basic_training_lessons l
SET expected_duration_seconds=f.real_seconds, updated_at=now()
FROM basic_duration_fix f
WHERE l.training_no=f.training_no AND l.expected_duration_seconds=f.old_seconds;

UPDATE public.basic_training_revisions r
SET expected_duration_seconds=f.real_seconds
FROM basic_duration_fix f, public.basic_training_lessons l
WHERE r.training_no=f.training_no AND l.training_no=f.training_no
  AND r.revision=l.active_revision AND r.expected_duration_seconds=f.old_seconds;

UPDATE public.basic_training_progress p
SET duration_seconds=f.real_seconds, updated_at=now()
FROM basic_duration_fix f
WHERE p.training_no=f.training_no;

-- Verify before committing: every fixed lesson now has the real duration.
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM basic_duration_fix f JOIN public.basic_training_lessons l USING (training_no)
            WHERE l.expected_duration_seconds<>f.real_seconds) THEN
   RAISE EXCEPTION 'Duration fix incomplete; rolled back';
 END IF;
END $$;

COMMIT;

-- After applying (read-only): SELECT training_no, expected_duration_seconds FROM public.basic_training_lessons ORDER BY 1;
