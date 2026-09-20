-- ============================================================
-- محمد AI Agent
-- Learning Loop v1
-- ============================================================
-- يحول عدة تجارب مرتبطة إلى "درس عملي مؤقت" قابل للاختبار.
-- لا يعتبر النمط حقيقة ثابتة؛ يبقى hypothesis حتى تتكرر الأدلة.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_agent_learning_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,

  topic text,
  pattern text,
  evidence_summary text,
  working_lesson text,
  next_test text,

  evidence_count integer NOT NULL DEFAULT 0
    CHECK (evidence_count >= 0),

  confidence numeric(3,2)
    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),

  status text NOT NULL DEFAULT 'testing'
    CHECK (status IN ('testing','supported','rejected','superseded')),

  source_event_ids uuid[] NOT NULL DEFAULT '{}',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_learning_patterns_user_updated
  ON public.ai_agent_learning_patterns(user_id, updated_at DESC);

ALTER TABLE public.ai_agent_learning_patterns ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_ai_agent_learning_patterns(
  p_token uuid,
  p_limit integer DEFAULT 8
)
RETURNS TABLE(
  id uuid,
  topic text,
  pattern text,
  evidence_summary text,
  working_lesson text,
  next_test text,
  evidence_count integer,
  confidence numeric,
  status text,
  source_event_ids uuid[],
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  uid uuid;
  lim integer := greatest(1, least(coalesce(p_limit,8),20));
BEGIN
  uid := public.current_user_id(p_token);

  IF uid IS NULL THEN
    RAISE EXCEPTION 'انتهت الجلسة';
  END IF;

  RETURN QUERY
  SELECT
    l.id,
    l.topic,
    l.pattern,
    l.evidence_summary,
    l.working_lesson,
    l.next_test,
    l.evidence_count,
    l.confidence,
    l.status,
    l.source_event_ids,
    l.created_at,
    l.updated_at
  FROM public.ai_agent_learning_patterns l
  WHERE l.user_id = uid
  ORDER BY l.updated_at DESC
  LIMIT lim;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_ai_agent_learning_pattern(
  p_token uuid,
  p_topic text DEFAULT NULL,
  p_pattern text DEFAULT NULL,
  p_evidence_summary text DEFAULT NULL,
  p_working_lesson text DEFAULT NULL,
  p_next_test text DEFAULT NULL,
  p_evidence_count integer DEFAULT 0,
  p_confidence numeric DEFAULT NULL,
  p_status text DEFAULT 'testing',
  p_source_event_ids uuid[] DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  uid uuid;
  existing_id uuid;
  new_id uuid;
  st text := lower(trim(coalesce(p_status,'testing')));
  conf numeric := p_confidence;
  cnt integer := greatest(0, coalesce(p_evidence_count,0));
BEGIN
  uid := public.current_user_id(p_token);

  IF uid IS NULL THEN
    RAISE EXCEPTION 'انتهت الجلسة';
  END IF;

  IF st NOT IN ('testing','supported','rejected','superseded') THEN
    st := 'testing';
  END IF;

  IF conf IS NOT NULL THEN
    conf := greatest(0, least(1, conf));
  END IF;

  IF nullif(trim(coalesce(p_pattern,'')),'') IS NULL
     AND nullif(trim(coalesce(p_working_lesson,'')),'') IS NULL THEN
    RETURN NULL;
  END IF;

  -- إذا كان لدينا درس قيد الاختبار لنفس الموضوع، نحدّثه بدل إنشاء نسخة مكررة.
  SELECT l.id
  INTO existing_id
  FROM public.ai_agent_learning_patterns l
  WHERE l.user_id = uid
    AND l.topic = nullif(left(trim(coalesce(p_topic,'')),500),'')
    AND l.status IN ('testing','supported')
  ORDER BY l.updated_at DESC
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    UPDATE public.ai_agent_learning_patterns
    SET
      pattern = nullif(left(trim(coalesce(p_pattern,'')),1200),''),
      evidence_summary = nullif(left(trim(coalesce(p_evidence_summary,'')),1600),''),
      working_lesson = nullif(left(trim(coalesce(p_working_lesson,'')),1200),''),
      next_test = nullif(left(trim(coalesce(p_next_test,'')),1000),''),
      evidence_count = greatest(l.evidence_count, cnt),
      confidence = conf,
      status = st,
      source_event_ids = coalesce(p_source_event_ids, source_event_ids),
      updated_at = now()
    WHERE id = existing_id
    RETURNING id INTO new_id;

    RETURN new_id;
  END IF;

  INSERT INTO public.ai_agent_learning_patterns(
    user_id,
    topic,
    pattern,
    evidence_summary,
    working_lesson,
    next_test,
    evidence_count,
    confidence,
    status,
    source_event_ids,
    updated_at
  )
  VALUES(
    uid,
    nullif(left(trim(coalesce(p_topic,'')),500),''),
    nullif(left(trim(coalesce(p_pattern,'')),1200),''),
    nullif(left(trim(coalesce(p_evidence_summary,'')),1600),''),
    nullif(left(trim(coalesce(p_working_lesson,'')),1200),''),
    nullif(left(trim(coalesce(p_next_test,'')),1000),''),
    cnt,
    conf,
    st,
    coalesce(p_source_event_ids,'{}'),
    now()
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_ai_agent_learning_patterns(uuid,integer)
FROM public, anon, authenticated;

REVOKE ALL ON FUNCTION public.save_ai_agent_learning_pattern(
  uuid,text,text,text,text,text,integer,numeric,text,uuid[]
)
FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_ai_agent_learning_patterns(uuid,integer)
TO service_role;

GRANT EXECUTE ON FUNCTION public.save_ai_agent_learning_pattern(
  uuid,text,text,text,text,text,integer,numeric,text,uuid[]
)
TO service_role;

NOTIFY pgrst, 'reload schema';
