-- ============================================================
-- محمد AI Agent
-- Causal Memory v1
-- ============================================================
-- يحفظ خبرات التدريب كعلاقات سبب/نتيجة قابلة لإعادة الاستخدام:
-- المحاولة -> النتيجة -> الملاحظة/السبب المحتمل -> التعديل القادم.
-- لا تُستخدم هذه الذاكرة لتشخيص العضو أو استنتاج صفات حساسة.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_agent_causal_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,

  topic text,
  attempt text,
  result text,
  observation text,
  hypothesis text,
  adjustment text,

  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','learned','superseded')),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_causal_memory_user_created
  ON public.ai_agent_causal_memory(user_id, created_at DESC);

ALTER TABLE public.ai_agent_causal_memory ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_ai_agent_causal_memory(
  p_token uuid,
  p_limit integer DEFAULT 12
)
RETURNS TABLE(
  id uuid,
  topic text,
  attempt text,
  result text,
  observation text,
  hypothesis text,
  adjustment text,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  uid uuid;
  lim integer := greatest(1, least(coalesce(p_limit,12),30));
BEGIN
  uid := public.current_user_id(p_token);

  IF uid IS NULL THEN
    RAISE EXCEPTION 'انتهت الجلسة';
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.topic,
    c.attempt,
    c.result,
    c.observation,
    c.hypothesis,
    c.adjustment,
    c.status,
    c.created_at,
    c.updated_at
  FROM public.ai_agent_causal_memory c
  WHERE c.user_id = uid
  ORDER BY c.created_at DESC
  LIMIT lim;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_ai_agent_causal_memory(
  p_token uuid,
  p_topic text DEFAULT NULL,
  p_attempt text DEFAULT NULL,
  p_result text DEFAULT NULL,
  p_observation text DEFAULT NULL,
  p_hypothesis text DEFAULT NULL,
  p_adjustment text DEFAULT NULL,
  p_status text DEFAULT 'open'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  uid uuid;
  new_id uuid;
  st text := lower(trim(coalesce(p_status,'open')));
BEGIN
  uid := public.current_user_id(p_token);

  IF uid IS NULL THEN
    RAISE EXCEPTION 'انتهت الجلسة';
  END IF;

  IF st NOT IN ('open','learned','superseded') THEN
    st := 'open';
  END IF;

  -- لا ننشئ سجلًا فارغًا.
  IF nullif(trim(coalesce(p_attempt,'')),'') IS NULL
     AND nullif(trim(coalesce(p_result,'')),'') IS NULL
     AND nullif(trim(coalesce(p_adjustment,'')),'') IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.ai_agent_causal_memory(
    user_id,
    topic,
    attempt,
    result,
    observation,
    hypothesis,
    adjustment,
    status,
    updated_at
  )
  VALUES(
    uid,
    nullif(left(trim(coalesce(p_topic,'')),500),''),
    nullif(left(trim(coalesce(p_attempt,'')),1000),''),
    nullif(left(trim(coalesce(p_result,'')),1000),''),
    nullif(left(trim(coalesce(p_observation,'')),1000),''),
    nullif(left(trim(coalesce(p_hypothesis,'')),1000),''),
    nullif(left(trim(coalesce(p_adjustment,'')),1000),''),
    st,
    now()
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_ai_agent_causal_memory(uuid,integer)
FROM public, anon, authenticated;

REVOKE ALL ON FUNCTION public.save_ai_agent_causal_memory(
  uuid,text,text,text,text,text,text,text
)
FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_ai_agent_causal_memory(uuid,integer)
TO service_role;

GRANT EXECUTE ON FUNCTION public.save_ai_agent_causal_memory(
  uuid,text,text,text,text,text,text,text
)
TO service_role;

NOTIFY pgrst, 'reload schema';
