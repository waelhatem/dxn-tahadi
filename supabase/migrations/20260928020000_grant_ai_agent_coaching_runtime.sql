-- Allow the server-side AI agent to persist coaching and daily training state.
-- Only service_role receives EXECUTE; anon/authenticated privileges remain unchanged.

grant execute on function public.get_ai_agent_coaching_session(uuid)
to service_role;

grant execute on function public.upsert_ai_agent_coaching_session(uuid, boolean, text, text, text, integer, timestamptz)
to service_role;

grant execute on function public.get_ai_agent_daily_coaching_state(uuid)
to service_role;

grant execute on function public.upsert_ai_agent_daily_coaching_state(uuid, date, jsonb, text)
to service_role;

grant execute on function public.training_assessment_bootstrap(uuid)
to service_role;
