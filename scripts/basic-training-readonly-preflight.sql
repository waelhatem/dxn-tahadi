-- READ-ONLY PREFLIGHT for existing Supabase project.
-- Safe to run in SQL Editor. No CREATE/INSERT/UPDATE/DELETE/ALTER or transaction writes.
-- The old training tables must remain unchanged. This checks only metadata and counts.
SELECT
  current_database() AS database_name,
  to_regprocedure('public.app_current_user_id(uuid)') IS NOT NULL AS session_resolver_exists,
  to_regclass('public.app_users') IS NOT NULL AS app_users_exists,
  to_regclass('public.training_lessons') IS NOT NULL AS existing_training_lessons_exists,
  to_regclass('public.training_questions') IS NOT NULL AS existing_training_questions_exists,
  to_regclass('public.training_progress') IS NOT NULL AS existing_training_progress_exists,
  to_regclass('public.training_answers') IS NOT NULL AS existing_training_answers_exists,
  to_regclass('public.basic_training_lessons') IS NOT NULL AS basic_lessons_installed,
  to_regclass('public.basic_training_questions') IS NOT NULL AS basic_questions_installed,
  to_regclass('public.basic_training_progress') IS NOT NULL AS basic_progress_installed,
  to_regclass('public.basic_training_attempts') IS NOT NULL AS basic_attempts_installed,
  to_regclass('public.basic_training_revisions') IS NOT NULL AS basic_revisions_installed,
  to_regprocedure('public.basic_training_admin_revision(uuid,integer,text,jsonb)') IS NOT NULL AS leader_editor_installed,
  to_regprocedure('public.basic_training_submit_quiz(uuid,integer,jsonb,integer)') IS NOT NULL AS versioned_submission_installed;
-- Counts for existing tables can be checked separately if all legacy tables exist:
-- SELECT (SELECT count(*) FROM public.training_lessons) AS old_lessons,
--        (SELECT count(*) FROM public.training_questions) AS old_questions,
--        (SELECT count(*) FROM public.training_progress) AS old_progress;
-- WARNING: the following is not a deployment or database test; compiling migration SQL
-- must be verified before any change to the live database.
