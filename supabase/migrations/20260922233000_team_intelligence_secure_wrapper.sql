create or replace function public.get_dxn_team_intelligence_secure(
  p_token uuid,
  p_mode text default 'summary',
  p_member_no text default null,
  p_generation integer default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.get_dxn_team_intelligence(
    p_token,
    p_mode,
    p_member_no,
    p_generation,
    p_limit
  );
end;
$$;

revoke all on function public.get_dxn_team_intelligence_secure(uuid,text,text,integer,integer)
from public;

grant execute on function public.get_dxn_team_intelligence_secure(uuid,text,text,integer,integer)
to anon, authenticated, service_role;

notify pgrst, 'reload schema';
