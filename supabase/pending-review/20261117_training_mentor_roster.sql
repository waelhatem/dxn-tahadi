-- PENDING REVIEW / DO NOT APPLY TO PRODUCTION BEFORE OWNER APPROVAL.
-- Mentor roster is independent of the member's canonical watch/quiz/result history.
-- A trainer may follow DXN downline members immediately; others must approve within
-- their own training tab. The trainee can revoke access without losing progress.
BEGIN;

CREATE TABLE IF NOT EXISTS public.training_mentor_trainees (
 trainer_user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
 trainee_member_no text NOT NULL CHECK (trainee_member_no ~ '^[0-9]{9}$'),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined')),
 created_at timestamptz NOT NULL DEFAULT now(),
 approved_at timestamptz,
 PRIMARY KEY(trainer_user_id,trainee_member_no)
);
CREATE INDEX IF NOT EXISTS training_mentor_trainees_member_idx
 ON public.training_mentor_trainees(trainee_member_no,status);
ALTER TABLE public.training_mentor_trainees ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.training_mentor_trainees FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.training_mentor_trainees TO service_role;

-- Name resolution never returns contact details or training results.
CREATE OR REPLACE FUNCTION public.training_mentor_lookup(p_token uuid,p_member_no text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE v_trainer uuid; v_own_no text; v_no text:=trim(coalesce(p_member_no,'')); v_name text;
BEGIN
 v_trainer:=public.app_current_user_id(p_token);
 SELECT coalesce(nullif(trim(m.member_no),''),nullif(trim(u.login_no),'')) INTO v_own_no
 FROM public.app_users u LEFT JOIN public.members m ON m.id=u.member_id
 WHERE u.id=v_trainer AND u.active AND u.role='member';
 IF v_own_no IS NULL THEN RAISE EXCEPTION 'هذه الخدمة مخصصة للأعضاء المسجلين'; END IF;
 IF v_no !~ '^[0-9]{9}$' THEN RAISE EXCEPTION 'رقم العضوية يجب أن يتكون من 9 أرقام'; END IF;
 IF v_no=v_own_no THEN RAISE EXCEPTION 'لا يمكنك إضافة عضويتك إلى قائمة متدربيك'; END IF;
 SELECT coalesce(nullif(trim(m.name),''),nullif(trim(d.member_name),''))
 INTO v_name FROM (SELECT v_no AS member_no) q
 LEFT JOIN public.members m ON trim(m.member_no)=q.member_no AND m.active
 LEFT JOIN public.dxn_team_members d ON trim(d.member_no)=q.member_no;
 IF v_name IS NULL THEN RAISE EXCEPTION 'رقم العضوية غير مسجل في بيانات المجتمع'; END IF;
 RETURN jsonb_build_object('member_no',v_no,'name',v_name);
END $fn$;

-- A DXN descendant of the trainer is linked directly. Other registered
-- members must approve the mentor request in their own training tab.
CREATE OR REPLACE FUNCTION public.training_mentor_add(p_token uuid,p_member_no text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE v_trainer uuid; v_own_no text; v_no text; v_name text;
 v_downline boolean:=false; v_status text;
BEGIN
 v_trainer:=public.app_current_user_id(p_token);
 SELECT coalesce(nullif(trim(m.member_no),''),nullif(trim(u.login_no),'')) INTO v_own_no
 FROM public.app_users u LEFT JOIN public.members m ON m.id=u.member_id
 WHERE u.id=v_trainer AND u.active AND u.role='member';
 IF v_own_no IS NULL THEN RAISE EXCEPTION 'هذه الخدمة مخصصة للأعضاء المسجلين'; END IF;
 SELECT x->>'member_no',x->>'name' INTO v_no,v_name
 FROM (SELECT public.training_mentor_lookup(p_token,p_member_no) x) q;
 -- The DXN registry's sponsor path (any generation), cycle protected.
 WITH RECURSIVE descendants AS (
  SELECT trim(member_no) AS no, ARRAY[trim(member_no)]::text[] AS path, 0 AS depth
  FROM public.dxn_team_members WHERE trim(member_no)=v_own_no
  UNION ALL
  SELECT trim(d.member_no),z.path||trim(d.member_no),z.depth+1
  FROM public.dxn_team_members d JOIN descendants z ON trim(d.sponsor_member_no)=z.no
  WHERE NOT trim(d.member_no)=ANY(z.path) AND z.depth<30
 )
 SELECT EXISTS(SELECT 1 FROM descendants WHERE no=v_no AND depth>0) INTO v_downline;
 INSERT INTO public.training_mentor_trainees(trainer_user_id,trainee_member_no,status,approved_at)
 VALUES(v_trainer,v_no,CASE WHEN v_downline THEN 'approved' ELSE 'pending' END,
        CASE WHEN v_downline THEN now() ELSE NULL END)
 ON CONFLICT(trainer_user_id,trainee_member_no) DO NOTHING;
 SELECT status INTO v_status FROM public.training_mentor_trainees
 WHERE trainer_user_id=v_trainer AND trainee_member_no=v_no;
 RETURN jsonb_build_object('ok',true,'member_no',v_no,'name',v_name,'status',v_status);
END $fn$;

-- Only the trainee can approve, reject or revoke a mentor's access.
CREATE OR REPLACE FUNCTION public.training_mentor_respond(
 p_token uuid,p_trainer_user_id uuid,p_approve boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE v_member_no text; v_user uuid;
BEGIN
 v_user:=public.app_current_user_id(p_token);
 SELECT coalesce(nullif(trim(m.member_no),''),nullif(trim(u.login_no),'')) INTO v_member_no
 FROM public.app_users u LEFT JOIN public.members m ON m.id=u.member_id
 WHERE u.id=v_user AND u.role='member' AND u.active;
 IF v_member_no IS NULL THEN RAISE EXCEPTION 'حساب عضو مطلوب'; END IF;
 UPDATE public.training_mentor_trainees SET
 status=CASE WHEN p_approve THEN 'approved' ELSE 'declined' END,
 approved_at=CASE WHEN p_approve THEN now() ELSE NULL END
 WHERE trainer_user_id=p_trainer_user_id AND trainee_member_no=v_member_no;
 IF NOT FOUND THEN RAISE EXCEPTION 'طلب المتابعة غير موجود'; END IF;
 RETURN jsonb_build_object('ok',true,'status',CASE WHEN p_approve THEN 'approved' ELSE 'declined' END);
END $fn$;

-- Trainers can remove a pending/approved entry. A declined entry is retained
-- to prevent re-enrolling a member who expressly revoked access.
CREATE OR REPLACE FUNCTION public.training_mentor_remove(p_token uuid,p_member_no text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE v_trainer uuid;
BEGIN
 v_trainer:=public.app_current_user_id(p_token);
 IF NOT EXISTS(SELECT 1 FROM public.app_users WHERE id=v_trainer AND active AND role='member')
 THEN RAISE EXCEPTION 'حساب عضو مطلوب'; END IF;
 DELETE FROM public.training_mentor_trainees
 WHERE trainer_user_id=v_trainer AND trainee_member_no=trim(coalesce(p_member_no,''))
 AND status<>'declined';
 IF NOT FOUND THEN RAISE EXCEPTION 'المتدرب غير موجود أو ألغى صلاحية المتابعة'; END IF;
 RETURN jsonb_build_object('ok',true);
END $fn$;

-- Trainer's roster plus incoming requests for the signed-in trainee.
-- Results are live read-only aggregates: not duplicated and never editable here.
CREATE OR REPLACE FUNCTION public.training_mentor_list(p_token uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE v_user uuid; v_member_no text; v_trainees jsonb; v_requests jsonb;
BEGIN
 v_user:=public.app_current_user_id(p_token);
 SELECT coalesce(nullif(trim(m.member_no),''),nullif(trim(u.login_no),'')) INTO v_member_no
 FROM public.app_users u LEFT JOIN public.members m ON m.id=u.member_id
 WHERE u.id=v_user AND u.active AND u.role='member';
 IF v_member_no IS NULL THEN RAISE EXCEPTION 'حساب عضو مطلوب'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'member_no',r.trainee_member_no,
  'name',coalesce(nullif(trim(m.name),''),nullif(trim(d.member_name),''),r.trainee_member_no),
  'status',r.status,'account_linked',CASE WHEN r.status='approved' THEN au.id IS NOT NULL ELSE false END,
  'basic_passed',CASE WHEN r.status='approved' THEN
   (SELECT count(*) FROM public.basic_training_progress p WHERE p.user_id=au.id AND p.passed AND p.watch_completed) ELSE NULL END,
  'professional_passed',CASE WHEN r.status='approved' THEN
   (SELECT count(*) FROM public.professional_training_progress p WHERE p.user_id=au.id AND p.passed AND p.watch_completed) ELSE NULL END,
  'advanced_passed',CASE WHEN r.status='approved' THEN
   (SELECT count(*) FROM public.advanced_financial_progress p WHERE p.user_id=au.id AND p.passed AND p.watch_completed) ELSE NULL END,
  'added_at',r.created_at
 ) ORDER BY r.created_at DESC),'[]'::jsonb) INTO v_trainees
 FROM public.training_mentor_trainees r
 LEFT JOIN public.members m ON trim(m.member_no)=r.trainee_member_no AND m.active
 LEFT JOIN public.dxn_team_members d ON trim(d.member_no)=r.trainee_member_no
 LEFT JOIN LATERAL (
  SELECT u.id FROM public.app_users u WHERE u.active AND u.role='member'
   AND (trim(u.login_no)=r.trainee_member_no OR u.member_id=m.id)
  ORDER BY CASE WHEN u.member_id=m.id THEN 0 ELSE 1 END LIMIT 1
 ) au ON r.status='approved'
 WHERE r.trainer_user_id=v_user;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'trainer_user_id',r.trainer_user_id,
  'name',coalesce(nullif(trim(tm.name),''),nullif(trim(tu.display_name),''),tu.login_no),
  'status',r.status,'requested_at',r.created_at
 ) ORDER BY r.created_at DESC),'[]'::jsonb) INTO v_requests
 FROM public.training_mentor_trainees r
 JOIN public.app_users tu ON tu.id=r.trainer_user_id AND tu.active
 LEFT JOIN public.members tm ON tm.id=tu.member_id
 WHERE r.trainee_member_no=v_member_no AND r.status IN ('pending','approved','declined');
 RETURN jsonb_build_object('trainees',v_trainees,'requests',v_requests);
END $fn$;

-- Detail access requires an approved trainer/trainee association. This RPC
-- never reads quiz answer keys, and never inserts/updates watch or quiz tables.
CREATE OR REPLACE FUNCTION public.training_mentor_details(p_token uuid,p_member_no text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE v_trainer uuid; v_no text:=trim(coalesce(p_member_no,'')); v_target_user uuid;
 v_name text; v_basic jsonb; v_professional jsonb; v_advanced jsonb;
BEGIN
 v_trainer:=public.app_current_user_id(p_token);
 IF v_trainer IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.app_users WHERE id=v_trainer AND active AND role='member'
 ) THEN RAISE EXCEPTION 'حساب عضو مطلوب'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.training_mentor_trainees r
  WHERE r.trainer_user_id=v_trainer AND r.trainee_member_no=v_no AND r.status='approved')
 THEN RAISE EXCEPTION 'لم تتم الموافقة على متابعة هذا المتدرب'; END IF;
 SELECT coalesce(nullif(trim(m.name),''),nullif(trim(d.member_name),''),v_no)
 INTO v_name FROM (SELECT v_no no) q
 LEFT JOIN public.members m ON trim(m.member_no)=q.no AND m.active
 LEFT JOIN public.dxn_team_members d ON trim(d.member_no)=q.no;
 SELECT u.id INTO v_target_user
 FROM public.app_users u LEFT JOIN public.members mm ON mm.id=u.member_id
 WHERE u.active AND u.role='member' AND (trim(u.login_no)=v_no OR trim(mm.member_no)=v_no)
 ORDER BY CASE WHEN trim(mm.member_no)=v_no THEN 0 ELSE 1 END LIMIT 1;

 SELECT coalesce(jsonb_agg(jsonb_build_object(
 'lesson_no',l.training_no,'title',l.title,'completed',coalesce(p.watch_completed,false),
 'watch_percent',CASE WHEN p.watch_completed THEN 100 WHEN coalesce(l.expected_duration_seconds,0)=0 THEN 0 ELSE LEAST(89,
    floor(100.0*coalesce(w.watched,0)
        /nullif(l.expected_duration_seconds,0))::integer) END,
 'best_score',p.best_score,'passed',coalesce(p.passed,false),'passed_at',p.passed_at,
 'updated_at',p.updated_at,
 'attempt_count',(SELECT count(*) FROM public.basic_training_attempts a WHERE a.user_id=v_target_user AND a.training_no=l.training_no)
 ) ORDER BY l.training_no),'[]'::jsonb) INTO v_basic
 FROM public.basic_training_lessons l
 LEFT JOIN public.basic_training_progress p ON p.user_id=v_target_user AND p.training_no=l.training_no
 LEFT JOIN LATERAL (SELECT max(a.watched_seconds) watched FROM public.training_watch_attempts a
  WHERE a.user_id=v_target_user AND a.track='basic' AND a.lesson_no=l.training_no) w ON true
 WHERE l.active;

 SELECT coalesce(jsonb_agg(jsonb_build_object(
 'lesson_no',l.lesson_no,'title',l.title,'completed',coalesce(p.watch_completed,false),
 'watch_percent',CASE WHEN p.watch_completed THEN 100 WHEN coalesce(l.expected_duration_seconds,0)=0 THEN 0 ELSE LEAST(89,
     floor(100.0*coalesce(w.watched,0)/nullif(l.expected_duration_seconds,0))::integer) END,
 'best_score',p.best_score,'passed',coalesce(p.passed,false),'passed_at',p.passed_at,
 'updated_at',p.updated_at,
 'attempt_count',(SELECT count(*) FROM public.professional_training_attempts a WHERE a.user_id=v_target_user AND a.lesson_no=l.lesson_no)
 ) ORDER BY l.lesson_no),'[]'::jsonb) INTO v_professional
 FROM public.professional_training_lessons l
 LEFT JOIN public.professional_training_progress p ON p.user_id=v_target_user AND p.lesson_no=l.lesson_no
 LEFT JOIN LATERAL (SELECT max(a.watched_seconds) watched FROM public.training_watch_attempts a
  WHERE a.user_id=v_target_user AND a.track='professional' AND a.lesson_no=l.lesson_no) w ON true;

 SELECT coalesce(jsonb_agg(jsonb_build_object(
 'lesson_no',l.lesson_no,'title',l.title,'completed',coalesce(p.watch_completed,false),
 'watch_percent',CASE WHEN p.watch_completed THEN 100 WHEN coalesce(l.expected_duration_seconds,0)=0 THEN 0 ELSE LEAST(89,
     floor(100.0*coalesce(w.watched,0)
      /nullif(l.expected_duration_seconds,0))::integer) END,
 'best_score',p.best_score,'passed',coalesce(p.passed,false),'passed_at',p.passed_at,
 'updated_at',p.updated_at,
 'attempt_count',(SELECT count(*) FROM public.advanced_financial_attempts a WHERE a.user_id=v_target_user AND a.lesson_no=l.lesson_no)
 ) ORDER BY l.lesson_no),'[]'::jsonb) INTO v_advanced
 FROM public.advanced_financial_lessons l
 LEFT JOIN public.advanced_financial_progress p ON p.user_id=v_target_user AND p.lesson_no=l.lesson_no
 LEFT JOIN LATERAL (SELECT max(a.watched_seconds) watched FROM public.training_watch_attempts a
  WHERE a.user_id=v_target_user AND a.track='advanced' AND a.lesson_no=l.lesson_no) w ON true;
 RETURN jsonb_build_object('member_no',v_no,'name',v_name,'account_linked',v_target_user IS NOT NULL,
    'basic',v_basic,'professional',v_professional,'advanced',v_advanced);
END $fn$;

REVOKE ALL ON FUNCTION public.training_mentor_lookup(uuid,text),
 public.training_mentor_add(uuid,text),public.training_mentor_list(uuid),
 public.training_mentor_details(uuid,text),public.training_mentor_remove(uuid,text),
 public.training_mentor_respond(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.training_mentor_lookup(uuid,text),
 public.training_mentor_add(uuid,text),public.training_mentor_list(uuid),
 public.training_mentor_details(uuid,text),public.training_mentor_remove(uuid,text),
 public.training_mentor_respond(uuid,uuid,boolean) TO anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
