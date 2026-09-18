-- V86.9: mark approved DXN membership requests as completed after the leader creates the external DXN membership.
ALTER TABLE public.dxn_membership_requests
  DROP CONSTRAINT IF EXISTS dxn_membership_requests_status_check;

ALTER TABLE public.dxn_membership_requests
  ADD CONSTRAINT dxn_membership_requests_status_check
  CHECK (status IN ('pending','approved','rejected','completed'));

CREATE OR REPLACE FUNCTION public.complete_dxn_membership_request(
  p_token uuid,
  p_request uuid
)
RETURNS public.dxn_membership_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r public.dxn_membership_requests;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.sessions s
    JOIN public.app_users u ON u.id=s.user_id
    WHERE s.token=p_token
      AND u.role='leader'
      AND u.active=true
  ) THEN
    RAISE EXCEPTION 'غير مصرح';
  END IF;

  UPDATE public.dxn_membership_requests
  SET status='completed'
  WHERE id=p_request
    AND status='approved'
  RETURNING * INTO r;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'الطلب غير موجود أو ليس في حالة مقبول';
  END IF;

  RETURN r;
END;
$function$;