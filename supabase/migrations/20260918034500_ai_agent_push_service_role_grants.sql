-- Push API uses the Supabase service role key.
-- Explicitly allow server-side RPC execution.

grant execute on function public.upsert_ai_agent_push_subscription(
  uuid,text,text,text,text
) to service_role;

grant execute on function public.remove_ai_agent_push_subscription(
  uuid,text
) to service_role;

grant execute on function public.list_ai_agent_push_candidates(
  integer
) to service_role;

grant execute on function public.mark_ai_agent_push_sent(
  uuid
) to service_role;

grant execute on function public.deactivate_ai_agent_push_subscription(
  uuid
) to service_role;

notify pgrst, 'reload schema';
