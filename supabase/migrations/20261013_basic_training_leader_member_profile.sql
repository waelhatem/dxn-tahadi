-- Feature branch only. NOT applied to the live Supabase project.
-- Read-only leader view into the existing basic_training_progress/attempts tables.
-- Depends on the two staged basic_training migrations from this branch.
BEGIN;

CREATE OR REPLACE FUNCTION public.basic_training_leader_member_profile(
  p_token uuid,
  p_member_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $fn$
DECLARE
  v_leader_id uuid;
  v_member_no text;
  v_member_name text;
  v_user_id uuid;
  v_lessons jsonb;
  v_total integer;
  v_passed integer;
  v_avg integer;
BEGIN
  v_leader_id := public.app_current_user_id(p_token);
  IF v_leader_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_users u
    WHERE u.id=v_leader_id AND u.active=true AND u.role='leader'
  ) THEN
    RAISE EXCEPTION 'هذا السجل متاح للقائد المخوّل فقط';
  END IF;

  SELECT m.member_no,m.name
  INTO v_member_no,v_member_name
  FROM public.members m
  WHERE m.id=p_member_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ملف العضو غير موجود';
  END IF;

  -- Prefer the canonical member_id link. Older accounts may be linked
  -- only by their exact membership number; ignore unrelated usernames.
  SELECT u.id INTO v_user_id
  FROM public.app_users u
  WHERE u.active=true
    AND (u.member_id=p_member_id
         OR (u.member_id IS NULL AND u.login_no=v_member_no))
  ORDER BY CASE WHEN u.member_id=p_member_id THEN 0 ELSE 1 END
  LIMIT 1;

  SELECT
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'training_no', l.training_no,
        'title', l.title,
        'watch_seconds', COALESCE(p.watch_seconds,0),
        'duration_seconds', l.expected_duration_seconds,
        'watch_percent', LEAST(100,ROUND(
           COALESCE(p.watch_seconds,0)::numeric*100 /
           NULLIF(l.expected_duration_seconds,0)
        ))::integer,
        'watch_completed', COALESCE(p.watch_completed,false),
        'best_score', p.best_score,
        'grade', CASE WHEN p.best_score IS NULL
                      THEN NULL ELSE p.best_score*5 END,
        'passed', COALESCE(p.passed,false),
        'passed_at', p.passed_at,
        'attempt_count', (
          SELECT COUNT(*) FROM public.basic_training_attempts a
          WHERE a.user_id=v_user_id AND a.training_no=l.training_no
        ),
        'last_attempt_at', (
          SELECT MAX(a.submitted_at) FROM public.basic_training_attempts a
          WHERE a.user_id=v_user_id AND a.training_no=l.training_no
        )
      ) ORDER BY l.training_no
    ),'[]'::jsonb),
    COUNT(*)::integer,
    COUNT(*) FILTER (
      WHERE p.passed IS TRUE AND p.watch_completed IS TRUE
    )::integer,
    COALESCE(ROUND(AVG(LEAST(100,
      COALESCE(p.watch_seconds,0)::numeric*100 /
      NULLIF(l.expected_duration_seconds,0)
    ))),0)::integer
  INTO v_lessons,v_total,v_passed,v_avg
  FROM public.basic_training_lessons l
  LEFT JOIN public.basic_training_progress p
    ON p.training_no=l.training_no AND p.user_id=v_user_id
  WHERE l.active=true;

  RETURN jsonb_build_object(
    'member_id',p_member_id,
    'member_no',v_member_no,
    'member_name',v_member_name,
    'account_linked',v_user_id IS NOT NULL,
    'total',v_total,
    'passed',v_passed,
    'average_watch_percent',v_avg,
    'lessons',v_lessons
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.basic_training_leader_member_profile(uuid,uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.basic_training_leader_member_profile(uuid,uuid)
  TO anon,authenticated,service_role;

COMMIT;
