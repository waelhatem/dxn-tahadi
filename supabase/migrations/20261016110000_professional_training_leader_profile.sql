-- Authorized read-only leader access to professional training scores.
-- Uses the same member-link lookup as the existing basic/advanced leader training profiles.
-- Does not modify or reset any member grades, attempts, watches, or answer keys.
BEGIN;

CREATE OR REPLACE FUNCTION public.professional_training_leader_member_profile(
 p_token uuid, p_member_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,pg_temp
AS $fn$
DECLARE
 v_leader uuid;
 v_member_no text;
 v_user uuid;
 v_lessons jsonb;
BEGIN
 v_leader:=public.app_current_user_id(p_token);
 IF v_leader IS NULL OR NOT EXISTS(
   SELECT 1 FROM public.app_users WHERE id=v_leader AND active AND role='leader'
 ) THEN RAISE EXCEPTION 'يتطلب صلاحية القائد'; END IF;

 SELECT member_no INTO v_member_no FROM public.members WHERE id=p_member_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'ملف العضو غير موجود'; END IF;

 SELECT u.id INTO v_user FROM public.app_users u
 WHERE u.active AND (u.member_id=p_member_id
   OR (u.member_id IS NULL AND u.login_no=v_member_no))
 ORDER BY CASE WHEN u.member_id=p_member_id THEN 0 ELSE 1 END
 LIMIT 1;

 SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'lesson_no',l.lesson_no,
  'title',l.title,
  'completed',COALESCE(p.watch_completed,false),
  'best_score',p.best_score,
  'passed',COALESCE(p.passed,false),
  'passed_at',p.passed_at,
  'attempt_count',(SELECT COUNT(*) FROM public.professional_training_attempts a
     WHERE a.user_id=v_user AND a.lesson_no=l.lesson_no)
 ) ORDER BY l.lesson_no),'[]'::jsonb)
 INTO v_lessons
 FROM public.professional_training_lessons l
 LEFT JOIN public.professional_training_progress p
   ON p.user_id=v_user AND p.lesson_no=l.lesson_no;

 RETURN jsonb_build_object(
  'member_id',p_member_id,
  'account_linked',v_user IS NOT NULL,
  'lessons',v_lessons
 );
END
$fn$;

REVOKE ALL ON FUNCTION public.professional_training_leader_member_profile(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.professional_training_leader_member_profile(uuid,uuid)
 TO anon,authenticated,service_role;
COMMIT;
