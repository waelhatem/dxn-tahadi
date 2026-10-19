-- Fix 403 when the secure Academy playback API reads a published video's path.
-- The service_role key remains server-side; grant only columns needed by
-- GET /rest/v1/academy_leader_videos?select=object_path&id=eq...&status=eq.published.
grant select (id, status, object_path)
  on table public.academy_leader_videos to service_role;
notify pgrst, 'reload schema';
