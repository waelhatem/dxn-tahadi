-- Team tab access: the authenticated member is derived from p_token.
-- No sponsor number is entered by the member.
-- The RPC itself restricts access to the member's own recursive downline.

grant execute on function public.get_dxn_team_intelligence(
  uuid,text,text,integer,integer
) to anon, authenticated;

notify pgrst, 'reload schema';
