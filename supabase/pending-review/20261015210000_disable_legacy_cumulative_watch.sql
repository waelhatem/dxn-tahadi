-- PENDING REVIEW — step 4 of the unified training engine rollout. Do not apply without explicit approval,
-- and only AFTER the new front end (training-engine.js) is deployed and verified with a test account.
-- Stops the legacy cumulative watch endpoints. Same signatures (old cached pages get a clear message);
-- no table or member data is changed.
--
-- Rollback: re-run the original definitions from supabase/migrations/20261013_basic_training_persistence_90_80.sql
-- (basic_training_watch_update) and 202610150001_advanced_financial_training.sql (advanced_financial_watch_update).

BEGIN;

-- ---------------------------------------------------------------- legacy cumulative watch endpoints
-- Kept with the same signatures (old cached pages) but no longer credit any watching.
CREATE OR REPLACE FUNCTION public.basic_training_watch_update(p_token uuid,p_training_no integer,p_current integer,p_duration integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
BEGIN RAISE EXCEPTION 'تم تحديث نظام المشاهدة؛ حدّث الصفحة لبدء مشاهدة جديدة'; END $fn$;
CREATE OR REPLACE FUNCTION public.advanced_financial_watch_update(p_token uuid,p_lesson_no integer,p_current integer,p_duration integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
BEGIN RAISE EXCEPTION 'تم تحديث نظام المشاهدة؛ حدّث الصفحة لبدء مشاهدة جديدة'; END $fn$;

COMMIT;
