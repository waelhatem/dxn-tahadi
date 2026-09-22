-- AI Agent usage and cost tracking
-- Records OpenAI text usage per API call so the project can measure
-- actual token consumption and estimated API cost by day/model.

create table if not exists public.ai_agent_usage_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  model text not null,
  input_tokens bigint not null default 0,
  cached_input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  total_tokens bigint not null default 0,
  estimated_cost_usd numeric(14,8) not null default 0,
  request_kind text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists ai_agent_usage_events_created_at_idx
  on public.ai_agent_usage_events(created_at desc);

create index if not exists ai_agent_usage_events_model_created_at_idx
  on public.ai_agent_usage_events(model, created_at desc);

create or replace function public.log_ai_agent_usage(
  p_model text,
  p_input_tokens bigint default 0,
  p_cached_input_tokens bigint default 0,
  p_output_tokens bigint default 0,
  p_total_tokens bigint default 0,
  p_estimated_cost_usd numeric default 0,
  p_request_kind text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  insert into public.ai_agent_usage_events(
    model,
    input_tokens,
    cached_input_tokens,
    output_tokens,
    total_tokens,
    estimated_cost_usd,
    request_kind,
    metadata
  )
  values(
    left(coalesce(p_model,''),120),
    greatest(coalesce(p_input_tokens,0),0),
    greatest(coalesce(p_cached_input_tokens,0),0),
    greatest(coalesce(p_output_tokens,0),0),
    greatest(coalesce(p_total_tokens,0),0),
    greatest(coalesce(p_estimated_cost_usd,0),0),
    nullif(left(coalesce(p_request_kind,''),80),''),
    coalesce(p_metadata,'{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.get_ai_agent_usage_summary(
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
language sql
security definer
set search_path = public
as $$
  select
    created_at::date as usage_date,
    model,
    count(*)::bigint as requests,
    sum(input_tokens)::bigint as input_tokens,
    sum(cached_input_tokens)::bigint as cached_input_tokens,
    sum(output_tokens)::bigint as output_tokens,
    sum(total_tokens)::bigint as total_tokens,
    round(sum(estimated_cost_usd), 8) as estimated_cost_usd
  from public.ai_agent_usage_events
  where created_at >= now() - make_interval(days => greatest(coalesce(p_days,30),1))
  group by created_at::date, model
  order by usage_date desc, model;
$$;

revoke all on table public.ai_agent_usage_events from public;
revoke all on function public.log_ai_agent_usage(text,bigint,bigint,bigint,bigint,numeric,text,jsonb) from public;
revoke all on function public.get_ai_agent_usage_summary(integer) from public;

grant execute on function public.log_ai_agent_usage(text,bigint,bigint,bigint,bigint,numeric,text,jsonb) to service_role;
grant execute on function public.get_ai_agent_usage_summary(integer) to service_role;

notify pgrst, 'reload schema';
