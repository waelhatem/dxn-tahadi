-- Read access for the AI agent's durable-knowledge retrieval.
-- api/ai-agent.js calls Supabase with SUPABASE_SECRET_KEY (service_role).
-- The default privileges for objects created by postgres in public give
-- service_role no SELECT on tables and no EXECUTE on functions, so both
-- retrieval channels failed silently and returned no stored knowledge.

-- loadAllDurableKnowledge reads this table directly over REST.
grant select on table public.ai_agent_knowledge to service_role;

-- searchDurableKnowledge calls this function over RPC.
grant execute on function public.search_ai_agent_knowledge(uuid, text, integer) to service_role;

-- Read-only on purpose: no INSERT, UPDATE or DELETE is granted. Writes stay
-- behind save_ai_training_material_knowledge. RLS and the function are unchanged.
