begin;

-- Refresh PostgREST's schema cache so the newly-created private-chat RPCs
-- are immediately discoverable by /rest/v1/rpc/*.
notify pgrst, 'reload schema';

commit;
