-- Allow the server-side AI agent (service_role) to persist and read conversation history.
-- Read/write behavior remains encapsulated by the existing SECURITY DEFINER functions.
-- No table privileges, RLS policies, or anonymous/authenticated privileges are changed.

grant execute on function public.get_ai_agent_memory(uuid, integer) to service_role;
grant execute on function public.save_ai_agent_message(uuid, text, text) to service_role;
