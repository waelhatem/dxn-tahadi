-- Staged security boundary for the private 8x20 basic-training question bank.
-- This migration contains NO question text and NO answer keys.
-- Run only after the empty basic-training schema has been installed in a TEST branch.
BEGIN;
CREATE OR REPLACE FUNCTION public.basic_training_import_private_bank(p_bank jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp
AS $fn$
DECLARE
  v_l jsonb;
  v_q jsonb;
  v_i integer;
  v_j integer;
  v_duration integer;
  v_index integer;
BEGIN
  -- Cannot be called through public /api/rpc's anon credential.
  IF current_user <> 'service_role' THEN
    RAISE EXCEPTION 'هذه الوظيفة محصورة بخادم الاستيراد الخاص';
  END IF;
  IF p_bank IS NULL OR jsonb_typeof(p_bank)<>'array' THEN
    RAISE EXCEPTION 'بنك التدريبات يجب أن يكون مصفوفة';
  END IF;
  IF jsonb_array_length(p_bank)<>8 THEN
    RAISE EXCEPTION 'يلزم ثمانية تدريبات';
  END IF;
  -- Import once into an empty isolated environment. Never overwrite member results.
  IF EXISTS(SELECT 1 FROM public.basic_training_lessons)
     OR EXISTS(SELECT 1 FROM public.basic_training_questions)
     OR EXISTS(SELECT 1 FROM public.basic_training_progress)
     OR EXISTS(SELECT 1 FROM public.basic_training_attempts) THEN
    RAISE EXCEPTION 'يجب أن تكون جداول التدريبات الأساسية فارغة قبل الاستيراد';
  END IF;

  FOR v_i IN 0..7 LOOP
    v_l:=p_bank->v_i;
    IF jsonb_typeof(v_l)<>'object'
       OR (v_l->>'training_no')::integer<>v_i+1
       OR length(btrim(v_l->>'title'))<4
       OR (v_l->>'video_id') !~ '^[A-Za-z0-9_-]{11}$'
       OR jsonb_typeof(v_l->'questions')<>'array' THEN
      RAISE EXCEPTION 'بيانات التدريب % غير صحيحة',v_i+1;
    END IF;
    v_duration:=(v_l->>'expected_duration_seconds')::integer;
    IF v_duration NOT BETWEEN 60 AND 14400
       OR jsonb_array_length(v_l->'questions')<>20 THEN
      RAISE EXCEPTION 'مدة التدريب أو عدد الأسئلة غير صحيح للتدريب %',v_i+1;
    END IF;
    INSERT INTO public.basic_training_lessons(training_no,title,video_id,expected_duration_seconds)
    VALUES(v_i+1,v_l->>'title',v_l->>'video_id',v_duration);
    FOR v_j IN 0..19 LOOP
      v_q:=v_l->'questions'->v_j;
      IF jsonb_typeof(v_q)<>'object'
         OR (v_q->>'no')::integer<>v_j+1
         OR length(btrim(v_q->>'question'))<3
         OR jsonb_typeof(v_q->'options')<>'array' THEN
        RAISE EXCEPTION 'تنسيق السؤال % في التدريب % غير صحيح',v_j+1,v_i+1;
      END IF;
      IF jsonb_array_length(v_q->'options')<>3 THEN
        RAISE EXCEPTION 'يجب أن يحتوي السؤال على ثلاثة خيارات';
      END IF;
      v_index:=(v_q->>'correct_index')::integer;
      IF v_index NOT BETWEEN 0 AND 2
        OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_q->'options') o
          WHERE jsonb_typeof(o)<>'string' OR length(btrim(o #>> '{}'))<1) THEN
        RAISE EXCEPTION 'الخيارات أو مفتاح التصحيح غير صالح';
      END IF;
      INSERT INTO public.basic_training_questions(training_no,question_no,question,options,correct_index)
      VALUES(v_i+1,v_j+1,v_q->>'question',v_q->'options',v_index);
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('lessons',8,'questions',160);
END
$fn$;
REVOKE ALL ON FUNCTION public.basic_training_import_private_bank(jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.basic_training_import_private_bank(jsonb) TO service_role;
COMMIT;
