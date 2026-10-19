-- Daily AI messages reuse global_announcements, never the chat/notification system.
-- Initially OFF: the leader explicitly enables publishing after deployment and secret setup.
begin;

alter table public.global_announcements
  add column if not exists source text not null default 'manual',
  add column if not exists publish_date date,
  add column if not exists expires_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'global_announcements_source_check') then
    alter table public.global_announcements
      add constraint global_announcements_source_check
      check (source in ('manual','daily_ai'));
  end if;
end $$;

create unique index if not exists global_announcements_daily_date_unique
  on public.global_announcements(publish_date) where source = 'daily_ai';

create table if not exists public.daily_announcement_settings (
  id integer primary key default 1 check(id = 1),
  enabled boolean not null default false,
  leader_user_id uuid references public.app_users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.daily_announcement_settings(id,enabled) values(1,false)
on conflict(id) do nothing;

alter table public.daily_announcement_settings enable row level security;
revoke all on public.daily_announcement_settings from public, anon, authenticated;

create or replace function public.get_daily_announcement_settings(p_token uuid)
returns json language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
  v_enabled boolean;
  v_updated timestamptz;
  v_last text;
  v_history json;
begin
  uid := public.app_current_user_id(p_token);
  if uid is null or public.current_role(p_token) <> 'leader' then
    raise exception 'هذه الإعدادات متاحة للقائد فقط';
  end if;
  select enabled,updated_at into v_enabled,v_updated
    from public.daily_announcement_settings where id=1;
  select max(publish_date)::text into v_last
    from public.global_announcements where source='daily_ai';
  select coalesce(json_agg(json_build_object('date',h.publish_date,'title',h.title)), '[]'::json)
  into v_history from (
    select publish_date,title from public.global_announcements
    where source='daily_ai' order by publish_date desc limit 7
  ) h;
  return json_build_object(
    'enabled', coalesce(v_enabled,false),
    'scheduled_time','08:00',
    'time_zone','Asia/Baghdad',
    'last_published_date',v_last,
    'history',v_history,
    'updated_at',v_updated
  );
end;
$$;
revoke all on function public.get_daily_announcement_settings(uuid) from public,anon,authenticated;
grant execute on function public.get_daily_announcement_settings(uuid) to anon,authenticated;

create or replace function public.set_daily_announcement_enabled(p_token uuid,p_enabled boolean)
returns json language plpgsql security definer set search_path = '' as $$
declare uid uuid;
begin
  uid := public.app_current_user_id(p_token);
  if uid is null or public.current_role(p_token) <> 'leader' then
    raise exception 'التحكم بالنشر الصباحي متاح للقائد فقط';
  end if;
  if p_enabled is null then raise exception 'قيمة التشغيل مطلوبة'; end if;
  insert into public.daily_announcement_settings(id,enabled,leader_user_id,updated_at)
  values(1,p_enabled,uid,now())
  on conflict(id) do update
    set enabled=excluded.enabled,leader_user_id=excluded.leader_user_id,updated_at=now();
  return json_build_object('ok',true,'enabled',p_enabled);
end;
$$;
revoke all on function public.set_daily_announcement_enabled(uuid,boolean) from public,anon,authenticated;
grant execute on function public.set_daily_announcement_enabled(uuid,boolean) to anon,authenticated;

-- Backend-only RPC. The cron endpoint authenticates with CRON_SECRET AND service_role.
create or replace function public.get_daily_announcement_cron_state()
returns json language plpgsql security definer set search_path = '' as $$
declare
  v_day date := (now() at time zone 'Asia/Baghdad')::date;
  v_enabled boolean;
  v_owner uuid;
  v_exists boolean;
  v_titles json;
begin
  select enabled,leader_user_id into v_enabled,v_owner
    from public.daily_announcement_settings where id=1;
  select exists(select 1 from public.global_announcements
    where source='daily_ai' and publish_date=v_day) into v_exists;
  select coalesce(json_agg(t.title), '[]'::json) into v_titles
    from (
      select title from public.global_announcements
      where source='daily_ai' order by publish_date desc limit 14
    ) t;
  return json_build_object(
    'day',v_day,'enabled',coalesce(v_enabled,false) and v_owner is not null,
    'already_published',v_exists,'recent_titles',v_titles
  );
end;
$$;
revoke all on function public.get_daily_announcement_cron_state() from public,anon,authenticated;
grant execute on function public.get_daily_announcement_cron_state() to service_role;

create or replace function public.publish_daily_global_announcement(
  p_day date, p_title text, p_body text
)
returns json language plpgsql security definer set search_path = '' as $$
declare
  v_enabled boolean;
  v_owner uuid;
  v_id uuid;
  v_inserted boolean := false;
  v_today date := (now() at time zone 'Asia/Baghdad')::date;
begin
  if p_day is distinct from v_today then
    raise exception 'يجب أن يكون تاريخ الرسالة هو اليوم الحالي بتوقيت بغداد';
  end if;
  select enabled,leader_user_id into v_enabled,v_owner
    from public.daily_announcement_settings where id=1 for update;
  if not coalesce(v_enabled,false) or v_owner is null
    or not exists(select 1 from public.app_users where id=v_owner and role='leader' and active=true) then
    raise exception 'النشر الصباحي غير مفعّل';
  end if;
  if char_length(trim(coalesce(p_title,''))) not between 5 and 200
    or char_length(trim(coalesce(p_body,''))) not between 150 and 4000 then
    raise exception 'عنوان أو نص الرسالة غير صالح';
  end if;
  insert into public.global_announcements (
    title,body,announcement_type,active,created_by_user_id,
    source,publish_date,expires_at
  )
  values (
    trim(p_title),trim(p_body),'announcement',true,v_owner,
    'daily_ai',p_day,((p_day + 1)::timestamp at time zone 'Asia/Baghdad')
  )
  on conflict (publish_date) where source='daily_ai' do nothing
  returning id into v_id;
  v_inserted := v_id is not null;
  if not v_inserted then
    select id into v_id from public.global_announcements
    where source='daily_ai' and publish_date=p_day;
  end if;
  return json_build_object('ok',true,'published',v_inserted,'id',v_id,'day',p_day);
end;
$$;
revoke all on function public.publish_daily_global_announcement(date,text,text)
  from public,anon,authenticated;
grant execute on function public.publish_daily_global_announcement(date,text,text)
  to service_role;

-- Manual broadcasts retain their existing acknowledgement model and always take priority.
-- Old daily messages are excluded rather than being replayed to members on later days.
create or replace function public.list_global_announcements_for_member(p_token uuid)
returns json language plpgsql security definer set search_path = '' as $$
declare uid uuid; result json;
begin
  uid := public.app_current_user_id(p_token);
  if uid is null or public.current_role(p_token) <> 'member' then
    return '[]'::json;
  end if;

  select coalesce(json_agg(json_build_object(
    'id',a.id,'title',a.title,'body',a.body,
    'announcement_type',a.announcement_type,'source',a.source,'created_at',a.created_at
  ) order by
    case when a.source='manual' and a.announcement_type='important' then 0
         when a.source='manual' and a.announcement_type='warning' then 1
         when a.source='daily_ai' then 2
         else 3 end,
    a.created_at desc), '[]'::json)
  into result
  from public.global_announcements a
  where a.active=true
    and (
      a.source='manual'
      or (a.source='daily_ai'
          and a.publish_date=(now() at time zone 'Asia/Baghdad')::date
          and a.expires_at>now())
    )
    and not exists (
      select 1 from public.global_announcement_reads r
      where r.announcement_id=a.id and r.user_id=uid
    );
  return result;
end;
$$;
revoke all on function public.list_global_announcements_for_member(uuid)
  from public,anon,authenticated;
grant execute on function public.list_global_announcements_for_member(uuid)
  to anon,authenticated;

notify pgrst,'reload schema';
commit;
