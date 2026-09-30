-- ============================================================
-- V86.73 — «🎓 أكاديمية المنصة»: platform walkthrough videos as YouTube links.
-- No file storage: each row points to a YouTube video.
--
-- Access model (same as ai_training_materials):
--   * RLS is enabled and every table privilege is revoked, so the table is never read
--     or written directly with the publishable key or through /api/rpc.
--   * Two SECURITY DEFINER functions validate the app session (public.sessions +
--     public.app_users) and are executable by service_role only; they are called by
--     api/academy-videos.js with the server-side secret key.
--   * list_academy_videos: any active session; published videos only, by sort_order.
--   * create_academy_video: leaders only — the role is checked here, not in the UI.
-- ============================================================

create table if not exists public.academy_videos (
  id uuid primary key default gen_random_uuid(),
  title text not null
    check (char_length(btrim(title)) between 1 and 160),
  section text not null default ''
    check (char_length(section) <= 80),
  youtube_url text not null,
  youtube_id text not null
    check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  status text not null default 'published'
    check (status in ('draft','published','archived')),
  sort_order integer not null default 0,
  created_by uuid not null references public.app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The stored link is always the canonical form of the stored id.
  constraint academy_videos_canonical_url
    check (youtube_url = 'https://www.youtube.com/watch?v=' || youtube_id)
);

create index if not exists academy_videos_published_order_idx
  on public.academy_videos(sort_order, created_at)
  where status = 'published';

alter table public.academy_videos enable row level security;
revoke all on table public.academy_videos from public, anon, authenticated;

create or replace function public.list_academy_videos(p_token uuid)
returns table(
  id uuid,
  title text,
  section text,
  youtube_url text,
  youtube_id text,
  sort_order integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $function$
begin
  if not exists(
    select 1
    from public.sessions s
    join public.app_users u on u.id = s.user_id
    where s.token = p_token
      and s.expires_at > now()
      and u.active = true
  ) then
    raise exception 'انتهت الجلسة';
  end if;

  return query
    select v.id, v.title, v.section, v.youtube_url, v.youtube_id, v.sort_order, v.created_at
    from public.academy_videos v
    where v.status = 'published'
    order by v.sort_order asc, v.created_at asc;
end;
$function$;

create or replace function public.create_academy_video(
  p_token uuid,
  p_title text,
  p_section text,
  p_youtube_url text,
  p_youtube_id text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  uid uuid;
  role_name text;
  v_title text := btrim(coalesce(p_title, ''));
  v_section text := btrim(coalesce(p_section, ''));
  v_id text := btrim(coalesce(p_youtube_id, ''));
  v_order integer;
  video_id uuid;
begin
  select s.user_id, lower(u.role)
    into uid, role_name
  from public.sessions s
  join public.app_users u on u.id = s.user_id
  where s.token = p_token
    and s.expires_at > now()
    and u.active = true
  limit 1;

  if uid is null then
    raise exception 'انتهت الجلسة';
  end if;

  if role_name <> 'leader' then
    raise exception 'إضافة فيديو للأكاديمية متاحة للقائد فقط';
  end if;

  if v_title = '' or char_length(v_title) > 160 then
    raise exception 'عنوان الفيديو مطلوب ولا يتجاوز 160 حرفًا';
  end if;

  if char_length(v_section) > 80 then
    raise exception 'اسم القسم لا يتجاوز 80 حرفًا';
  end if;

  if v_id !~ '^[A-Za-z0-9_-]{11}$'
     or coalesce(p_youtube_url, '') <> 'https://www.youtube.com/watch?v=' || v_id then
    raise exception 'رابط YouTube غير صالح';
  end if;

  -- New videos go to the end of the list; the lock keeps concurrent inserts ordered.
  perform pg_advisory_xact_lock(hashtext('public.academy_videos.sort_order'));
  select coalesce(max(v.sort_order), 0) + 1 into v_order from public.academy_videos v;

  insert into public.academy_videos(title, section, youtube_url, youtube_id, status, sort_order, created_by)
  values (v_title, v_section, p_youtube_url, v_id, 'published', v_order, uid)
  returning id into video_id;

  return video_id;
end;
$function$;

revoke all on function public.list_academy_videos(uuid)
  from public, anon, authenticated;

revoke all on function public.create_academy_video(uuid, text, text, text, text)
  from public, anon, authenticated;

grant execute on function public.list_academy_videos(uuid)
  to service_role;

grant execute on function public.create_academy_video(uuid, text, text, text, text)
  to service_role;

notify pgrst, 'reload schema';
