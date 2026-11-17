-- ONE ACTIVE TRAINER PER TRAINEE — requested by the project owner.
-- Applied separately from the original mentor roster migration.
-- Existing trainer links and all training watch/quiz/score tables remain untouched.
BEGIN;

-- Two simultaneous attempts cannot claim the same trainee.
-- Pending requests reserve the trainee too. Declined links do not reserve it.
CREATE UNIQUE INDEX IF NOT EXISTS training_mentor_one_active_trainer_idx
 ON public.training_mentor_trainees (trainee_member_no)
 WHERE status IN ('pending','approved');

CREATE OR REPLACE FUNCTION public.training_mentor_lookup(p_token uuid,p_member_no text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE
 v_trainer uuid;
 v_own_no text;
 v_no text:=trim(coalesce(p_member_no,''));
 v_name text;
 v_own_status text;
 v_occupied boolean;
BEGIN
 v_trainer:=public.app_current_user_id(p_token);
 SELECT coalesce(nullif(trim(m.member_no),''),nullif(trim(u.login_no),''))
 INTO v_own_no
 FROM public.app_users u
 LEFT JOIN public.members m ON m.id=u.member_id
 WHERE u.id=v_trainer AND u.active AND u.role='member';
 IF v_own_no IS NULL THEN RAISE EXCEPTION 'هذه الخدمة مخصصة للأعضاء المسجلين'; END IF;
 IF v_no !~ '^[0-9]{9}$' THEN RAISE EXCEPTION 'رقم العضوية يجب أن يتكون من 9 أرقام'; END IF;
 IF v_no=v_own_no THEN RAISE EXCEPTION 'لا يمكنك إضافة عضويتك إلى قائمة المتدربين لديك'; END IF;
 SELECT coalesce(nullif(trim(m.name),''),nullif(trim(d.member_name),''))
 INTO v_name FROM (SELECT v_no AS member_no) q
 LEFT JOIN public.members m ON trim(m.member_no)=q.member_no AND m.active
 LEFT JOIN public.dxn_team_members d ON trim(d.member_no)=q.member_no;
 IF v_name IS NULL THEN RAISE EXCEPTION 'رقم العضوية غير مسجل في بيانات المجتمع'; END IF;

 SELECT r.status INTO v_own_status
 FROM public.training_mentor_trainees r
 WHERE r.trainer_user_id=v_trainer AND r.trainee_member_no=v_no;
 SELECT EXISTS (
  SELECT 1 FROM public.training_mentor_trainees r
  WHERE r.trainee_member_no=v_no AND r.trainer_user_id<>v_trainer
   AND r.status IN ('pending','approved')
 ) INTO v_occupied;
 RETURN jsonb_build_object(
  'member_no',v_no,'name',v_name,
  'assignment_status',CASE
    WHEN v_occupied THEN 'occupied'
    WHEN v_own_status IS NOT NULL THEN 'mine'
    ELSE 'available' END,
  'own_status',v_own_status
 );
END $fn$;

CREATE OR REPLACE FUNCTION public.training_mentor_add(p_token uuid,p_member_no text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE
 v_trainer uuid;
 v_own_no text;
 v_no text;
 v_name text;
 v_assignment text;
 v_downline boolean:=false;
 v_status text;
BEGIN
 v_trainer:=public.app_current_user_id(p_token);
 SELECT coalesce(nullif(trim(m.member_no),''),nullif(trim(u.login_no),''))
 INTO v_own_no
 FROM public.app_users u LEFT JOIN public.members m ON m.id=u.member_id
 WHERE u.id=v_trainer AND u.active AND u.role='member';
 IF v_own_no IS NULL THEN RAISE EXCEPTION 'هذه الخدمة مخصصة للأعضاء المسجلين'; END IF;

 SELECT x->>'member_no',x->>'name',x->>'assignment_status'
 INTO v_no,v_name,v_assignment
 FROM (SELECT public.training_mentor_lookup(p_token,p_member_no) AS x) q;
 IF v_assignment='occupied' THEN
  RAISE EXCEPTION 'المتدرب تحت التدريب لدى مدرب آخر، ولا يمكن إضافته مرة ثانية';
 END IF;
 IF v_assignment='mine' THEN
  SELECT status INTO v_status FROM public.training_mentor_trainees
  WHERE trainer_user_id=v_trainer AND trainee_member_no=v_no;
  RETURN jsonb_build_object(
   'ok',true,'member_no',v_no,'name',v_name,'status',v_status,'already_added',true
  );
 END IF;

 WITH RECURSIVE descendants AS (
  SELECT trim(member_no) AS no, ARRAY[trim(member_no)]::text[] AS path, 0 AS depth
  FROM public.dxn_team_members WHERE trim(member_no)=v_own_no
  UNION ALL
  SELECT trim(d.member_no),z.path||trim(d.member_no),z.depth+1
  FROM public.dxn_team_members d JOIN descendants z ON trim(d.sponsor_member_no)=z.no
  WHERE NOT trim(d.member_no)=ANY(z.path) AND z.depth<30
 )
 SELECT EXISTS(SELECT 1 FROM descendants WHERE no=v_no AND depth>0) INTO v_downline;

 -- The unique partial index is the final concurrency-safe guard, even when
 -- the two trainers both passed the earlier lookup in different transactions.
 BEGIN
  INSERT INTO public.training_mentor_trainees(trainer_user_id,trainee_member_no,status,approved_at)
  VALUES(v_trainer,v_no,CASE WHEN v_downline THEN 'approved' ELSE 'pending' END,
         CASE WHEN v_downline THEN now() ELSE NULL END)
  ON CONFLICT(trainer_user_id,trainee_member_no) DO NOTHING;
 EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'المتدرب تحت التدريب لدى مدرب آخر، ولا يمكن إضافته مرة ثانية';
 END;

 SELECT status INTO v_status FROM public.training_mentor_trainees
 WHERE trainer_user_id=v_trainer AND trainee_member_no=v_no;
 RETURN jsonb_build_object('ok',true,'member_no',v_no,'name',v_name,'status',v_status);
END $fn$;

-- Prevent a previously declined trainer relationship from being reapproved
-- when another trainer has already claimed this trainee.
CREATE OR REPLACE FUNCTION public.training_mentor_respond(
 p_token uuid,p_trainer_user_id uuid,p_approve boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE v_member_no text; v_user uuid;
BEGIN
 v_user:=public.app_current_user_id(p_token);
 SELECT coalesce(nullif(trim(m.member_no),''),nullif(trim(u.login_no,'')))
 INTO v_member_no FROM public.app_users u
 LEFT JOIN public.members m ON m.id=u.member_id
 WHERE u.id=v_user AND u.role='member' AND u.active;
 IF v_member_no IS NULL THEN RAISE EXCEPTION 'حساب عضو مطلوب'; END IF;
 BEGIN
  UPDATE public.training_mentor_trainees SET
   status=CASE WHEN p_approve THEN 'approved' ELSE 'declined' END,
   approved_at=CASE WHEN p_approve THEN now() ELSE NULL END
  WHERE trainer_user_id=p_trainer_user_id AND trainee_member_no=v_member_no;
 EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'المتدرب تحت التدريب لدى مدرب آخر؛ لا يمكن اعتماد مدربين في الوقت نفسه';
 END;
 IF NOT FOUND THEN RAISE EXCEPTION 'طلب المتابعة غير موجود'; END IF;
 RETURN jsonb_build_object('ok',true,'status',CASE WHEN p_approve THEN 'approved' ELSE 'declined' END);
END $fn$;

REVOKE ALL ON FUNCTION public.training_mentor_lookup(uuid,text),
 public.training_mentor_add(uuid,text),
 public.training_mentor_respond(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.training_mentor_lookup(uuid,text),
 public.training_mentor_add(uuid,text),
 public.training_mentor_respond(uuid,uuid,boolean) TO anon,authenticated,service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
