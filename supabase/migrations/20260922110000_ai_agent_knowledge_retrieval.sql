-- ============================================================
-- Knowledge retrieval: query the full durable knowledge base
-- instead of relying only on the first N rows.
-- ============================================================

create or replace function public.search_ai_agent_knowledge(
  p_token uuid,
  p_query text,
  p_limit integer default 30
)
returns table(
  id uuid,
  scope text,
  category text,
  title text,
  content text,
  priority integer,
  updated_at timestamptz,
  relevance integer
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  role_name text;
  lim integer := greatest(1, least(coalesce(p_limit,30),80));
  q text := lower(trim(coalesce(p_query,'')));
begin
  select lower(u.role)
    into role_name
  from public.sessions s
  join public.app_users u on u.id=s.user_id
  where s.token=p_token
    and s.expires_at>now()
    and u.active=true
  limit 1;

  if role_name is null then
    raise exception 'انتهت الجلسة';
  end if;

  return query
  with terms as (
    select distinct trim(x) as term
    from regexp_split_to_table(q, '\s+') as x
    where char_length(trim(x)) >= 2
  ),
  scored as (
    select
      k.id,
      k.scope,
      k.category,
      k.title,
      k.content,
      k.priority,
      k.updated_at,
      (
        coalesce(sum(
          case
            when lower(k.title || ' ' || k.content) like '%' || t.term || '%' then 1
            else 0
          end
        ),0)
        + case when k.category='dxn_pdf_source_exact' then 5 else 0 end
        + case when k.source like '%uploaded_pdf_exact%' then 5 else 0 end
      )::integer as relevance
    from public.ai_agent_knowledge k
    left join terms t on true
    where k.active=true
      and (k.scope='global' or k.scope=role_name)
    group by
      k.id,k.scope,k.category,k.title,k.content,k.priority,k.updated_at,k.source
  )
  select
    s.id,s.scope,s.category,s.title,s.content,s.priority,s.updated_at,s.relevance
  from scored s
  where s.relevance>0
  order by s.relevance desc, s.priority desc, s.updated_at desc
  limit lim;
end;
$function$;

revoke all on function public.search_ai_agent_knowledge(uuid,text,integer)
  from public, anon, authenticated;

grant execute on function public.search_ai_agent_knowledge(uuid,text,integer)
  to anon, authenticated;

notify pgrst, 'reload schema';
