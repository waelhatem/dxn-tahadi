-- Production fix: a normal manual announcement is valid only on its
-- Baghdad publication date. Daily AI is already day-limited; explicit
-- important/warning broadcasts and all video/welcome notifications retain
-- their previous acknowledgement and member-scope behavior.
-- Historical rows are kept for audit, but old normal announcements are
-- deactivated so they no longer clog the member queue.
BEGIN;
UPDATE public.global_announcements
SET active=false
WHERE source='manual'
  AND announcement_type NOT IN ('important','warning')
  AND (created_at AT TIME ZONE 'Asia/Baghdad')::date < (now() AT TIME ZONE 'Asia/Baghdad')::date;
CREATE OR REPLACE FUNCTION public.list_global_announcements_for_member(p_token uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid;
  role_name text;
  registered_at timestamptz;
  result json;
begin
  uid:=public.app_current_user_id(p_token);
  role_name:=public.app_current_role(p_token);
  if uid is null or role_name not in ('member','leader') then return '[]'::json; end if;

  select u.created_at into registered_at
  from public.app_users u
  where u.id=uid and u.active;
  if registered_at is null then return '[]'::json; end if;

  select coalesce(json_agg(json_build_object(
    'id',a.id,'title',a.title,'body',a.body,'announcement_type',a.announcement_type,
    'source',a.source,'video_id',a.video_id,'is_welcome',coalesce(v.is_welcome,false),
    'created_at',a.created_at,'publish_date',a.publish_date,'expires_at',a.expires_at
  ) order by case
    when a.source='video' and v.is_welcome and a.created_at<registered_at then -1
    when a.source='manual' and a.announcement_type='important' then 0
    when a.source='manual' and a.announcement_type='warning' then 1
    when a.source='video' then 2 when a.source='daily_ai' then 3 else 4 end,
    a.created_at desc),'[]'::json)
  into result
  from public.global_announcements a
  left join public.academy_leader_videos v
    on v.id=a.video_id and v.status='published'
  where a.active
    and (
      -- The leader is not sent their own manual/video announcements.
      (role_name='leader'
        and a.source='daily_ai'
        and a.publish_date=(now() at time zone 'Asia/Baghdad')::date
        and a.expires_at>now())
      or
      (role_name='member'
        and (a.created_at>=registered_at
          or (a.source='video' and v.is_welcome=true and a.created_at<registered_at))
        and (
          a.source='video'
          or (a.source='manual'
             and (a.announcement_type in ('important','warning')
                  or (a.created_at at time zone 'Asia/Baghdad')::date=(now() at time zone 'Asia/Baghdad')::date))
          or (a.source='daily_ai'
              and a.publish_date=(now() at time zone 'Asia/Baghdad')::date
              and a.expires_at>now())))
    )
    and not exists(select 1 from public.global_announcement_reads r
      where r.announcement_id=a.id and r.user_id=uid);
  return result;
end $function$
;
REVOKE ALL ON FUNCTION public.list_global_announcements_for_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_global_announcements_for_member(uuid) TO anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
