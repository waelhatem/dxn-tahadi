-- V85.3: force PostgREST to reload the public schema after auth RPC changes.
-- This addresses stale RPC/function signatures in the API schema cache.
notify pgrst, 'reload schema';
