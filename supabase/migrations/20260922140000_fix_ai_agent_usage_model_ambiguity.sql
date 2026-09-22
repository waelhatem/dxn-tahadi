-- Fix ambiguous model reference in leader AI usage summary RPC.
-- The return column "model" is also a PL/pgSQL variable, so qualify the table column.

create or replace function public.get_ai_agent_usage_summary_for_leader(
  p_token uuid,
  p_days integer default 30
)
returns table(
  usage_date date,
  model text,
  requests bigint,
  input_tokens bigint,
  cached_input_tokens bigint,
  output_tokens bigint,
  total_tokens bigint,
  estimated_cost_usd numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.app_current_role(p_token) <> 'leader' then
    raise exception 'غير مصرح';
  end if;

  return query
  select
    e.created_at::date as usage_date,
    e.model,
    count(*)::bigint as requests,
    sum(e.input_tokens)::bigint as input_tokens,
    sum(e.cached_input_tokens)::bigint as cached_input_tokens,
    sum(e.output_tokens)::bigint as output_tokens,
    sum(e.total_tokens)::bigint as total_tokens,
    round(sum(e.estimated_cost_usd), 8) as estimated_cost_usd
  from public.ai_agent_usage_events e
  where e.created_at >= now() - make_interval(
    days => greatest(coalesce(p_days, 30), 1)
  )
  group by e.created_at::date, e.model
  order by e.created_at::date desc, e.model;
end;
$$;

revoke all on function public.get_ai_agent_usage_summary_for_leader(uuid,integer)
from public;

grant execute on function public.get_ai_agent_usage_summary_for_leader(uuid,integer)
to anon, authenticated;

notify pgrst, 'reload schema';
