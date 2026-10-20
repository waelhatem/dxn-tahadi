-- Permit the leader to receive and acknowledge ONLY today's AI morning announcement.
-- Preserve members' welcome-video rules, their join-date filter, and manual/video priorities.
begin;

create or replace function public.list_global_announcements_for_member(p_token uuid)
returns json language plpgsql security definer set search_path='' as $$
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
    'created_at',a.created_at
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
        and (a.source in ('manual','video')
          or (a.source='daily_ai'
            and a.publish_date=(now() at time zone 'Asia/Baghdad')::date
            and a.expires_at>now())))
    )
    and not exists(select 1 from public.global_announcement_reads r
      where r.announcement_id=a.id and r.user_id=uid);
  return result;
end $$;
revoke all on function public.list_global_announcements_for_member(uuid) from public,anon,authenticated;
grant execute on function public.list_global_announcements_for_member(uuid) to anon,authenticated;

create or replace function public.acknowledge_global_announcement(
  p_token uuid, p_announcement_id uuid
) returns boolean language plpgsql security definer set search_path='' as $$
declare uid uuid;role_name text;
begin
  uid:=public.app_current_user_id(p_token);
  role_name:=public.app_current_role(p_token);
  if uid is null or role_name not in ('member','leader') then
    raise exception 'لا توجد صلاحية لتأكيد الإعلان';
  end if;
  if not exists (
    select 1 from public.global_announcements a
    where a.id=p_announcement_id and a.active
      and (role_name='member'
        or (role_name='leader' and a.source='daily_ai'
          and a.publish_date=(now() at time zone 'Asia/Baghdad')::date
          and a.expires_at>now()))
  ) then
    raise exception 'الإعلان غير موجود أو ليس ضمن صلاحيات هذا الحساب';
  end if;
  insert into public.global_announcement_reads(announcement_id,user_id)
  values(p_announcement_id,uid)
  on conflict (announcement_id,user_id) do nothing;
  return true;
end $$;
revoke all on function public.acknowledge_global_announcement(uuid,uuid) from public,anon,authenticated;
grant execute on function public.acknowledge_global_announcement(uuid,uuid) to anon,authenticated;

notify pgrst,'reload schema';
commit;
