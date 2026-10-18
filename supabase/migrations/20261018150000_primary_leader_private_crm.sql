-- Private follow-up CRM for the primary LEADER account only.
-- Apply only after PR review; no existing tables or functions are modified.
create table if not exists public.leader_private_leads (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(btrim(full_name)) between 2 and 160),
  phone text not null default '' check (length(phone) <= 35),
  country text not null default '' check (length(country) <= 100),
  city text not null default '' check (length(city) <= 100),
  campaign text not null default '' check (length(campaign) <= 180),
  source text not null default 'إعلان ممول' check (length(source) <= 100),
  status text not null default 'new' check (status in (
    'new','contacted','no_reply','no_whatsapp','existing_member',
    'registered','training','contests_sent','points','group',
    'blocked','not_interested'
  )),
  member_no text not null default '' check (length(member_no) <= 30),
  details text not null default '' check (length(details) <= 3000),
  last_contact_at timestamptz,
  next_follow_up_at date,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists leader_private_leads_status_idx on public.leader_private_leads(status,created_at desc) where archived_at is null;
create index if not exists leader_private_leads_due_idx on public.leader_private_leads(next_follow_up_at) where archived_at is null;
create table if not exists public.leader_private_lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leader_private_leads(id) on delete cascade,
  event_type text not null check (event_type in ('created','status','contact','note')),
  note text not null default '' check (length(note) <= 3000),
  status text not null default '' check (length(status) <= 40),
  created_at timestamptz not null default now()
);
create index if not exists leader_private_lead_events_lead_idx on public.leader_private_lead_events(lead_id,created_at desc);
alter table public.leader_private_leads enable row level security;
alter table public.leader_private_lead_events enable row level security;
-- No direct SELECT/INSERT/UPDATE/DELETE policies are created for browser roles.
revoke all on public.leader_private_leads from public, anon, authenticated;
revoke all on public.leader_private_lead_events from public, anon, authenticated;

create or replace function public.primary_leader_crm(
  p_token uuid,
  p_action text default 'list',
  p_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  actor uuid;
  v_id uuid;
  rec public.leader_private_leads%rowtype;
  rows_json jsonb;
  previous_status text;
  new_status text;
  kind text;
  note_text text;
begin
  actor := public.app_current_user_id(p_token);
  if actor is null or not exists (
    select 1 from public.app_users u
    where u.id=actor and u.id='5cf50c5d-d23e-499e-96b3-f71b10c4d854'::uuid
      and u.login_no='LEADER' and u.role='leader' and u.active
  ) then
    raise exception 'غير مصرح: هذا القسم لحساب القائد الأساسي فقط';
  end if;

  if p_action = 'list' then
    select coalesce(jsonb_agg(to_jsonb(l) order by l.updated_at desc),'[]'::jsonb)
      into rows_json
    from public.leader_private_leads l where l.archived_at is null;
    return jsonb_build_object('items',rows_json);
  elsif p_action = 'events' then
    v_id := (p_payload->>'id')::uuid;
    if not exists(select 1 from public.leader_private_leads where id=v_id and archived_at is null) then
      raise exception 'السجل غير موجود';
    end if;
    select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc),'[]'::jsonb)
      into rows_json from public.leader_private_lead_events e where e.lead_id=v_id;
    return jsonb_build_object('items',rows_json);
  elsif p_action = 'save' then
    v_id := nullif(p_payload->>'id','')::uuid;
    new_status := coalesce(nullif(p_payload->>'status',''),'new');
    if new_status not in ('new','contacted','no_reply','no_whatsapp','existing_member',
      'registered','training','contests_sent','points','group','blocked','not_interested') then
      raise exception 'حالة غير معتمدة';
    end if;
    if length(btrim(coalesce(p_payload->>'full_name',''))) < 2 then
      raise exception 'أدخل اسم المهتم';
    end if;
    if v_id is null then
      insert into public.leader_private_leads
        (full_name,phone,country,city,campaign,source,status,member_no,details,next_follow_up_at)
      values (
        left(btrim(p_payload->>'full_name'),160),left(btrim(coalesce(p_payload->>'phone','')),35),
        left(btrim(coalesce(p_payload->>'country','')),100),left(btrim(coalesce(p_payload->>'city','')),100),
        left(btrim(coalesce(p_payload->>'campaign','')),180),left(btrim(coalesce(p_payload->>'source','إعلان ممول')),100),
        new_status,left(btrim(coalesce(p_payload->>'member_no','')),30),
        left(btrim(coalesce(p_payload->>'details','')),3000),
        nullif(p_payload->>'next_follow_up_at','')::date
      ) returning * into rec;
      insert into public.leader_private_lead_events(lead_id,event_type,note,status)
      values(rec.id,'created','إضافة مهتم جديد',rec.status);
    else
      select * into rec from public.leader_private_leads
        where id=v_id and archived_at is null for update;
      if not found then raise exception 'السجل غير موجود'; end if;
      previous_status := rec.status;
      update public.leader_private_leads set
        full_name=left(btrim(p_payload->>'full_name'),160),
        phone=left(btrim(coalesce(p_payload->>'phone','')),35),
        country=left(btrim(coalesce(p_payload->>'country','')),100),
        city=left(btrim(coalesce(p_payload->>'city','')),100),
        campaign=left(btrim(coalesce(p_payload->>'campaign','')),180),
        source=left(btrim(coalesce(p_payload->>'source','إعلان ممول')),100),
        member_no=left(btrim(coalesce(p_payload->>'member_no','')),30),
        details=left(btrim(coalesce(p_payload->>'details','')),3000),
        next_follow_up_at=nullif(p_payload->>'next_follow_up_at','')::date,
        status=new_status,
        updated_at=now()
      where id=v_id returning * into rec;
      if previous_status<>rec.status then
        insert into public.leader_private_lead_events(lead_id,event_type,note,status)
        values(rec.id,'status','تغيير الحالة',rec.status);
      end if;
    end if;
    return jsonb_build_object('item',to_jsonb(rec));
  elsif p_action = 'status' then
    v_id := (p_payload->>'id')::uuid;
    new_status := p_payload->>'status';
    if new_status not in ('new','contacted','no_reply','no_whatsapp','existing_member',
      'registered','training','contests_sent','points','group','blocked','not_interested') then
      raise exception 'حالة غير معتمدة';
    end if;
    select * into rec from public.leader_private_leads
      where id=v_id and archived_at is null for update;
    if not found then raise exception 'السجل غير موجود'; end if;
    if rec.status<>new_status then
      update public.leader_private_leads set
        status=new_status,updated_at=now(),
        last_contact_at=case when new_status='contacted' then now() else last_contact_at end
        where id=v_id returning * into rec;
      insert into public.leader_private_lead_events(lead_id,event_type,note,status)
      values(v_id,'status','تغيير الحالة',new_status);
    end if;
    return jsonb_build_object('item',to_jsonb(rec));
  elsif p_action = 'activity' then
    v_id := (p_payload->>'id')::uuid;
    kind := coalesce(p_payload->>'kind','note');
    if kind not in ('contact','note') then raise exception 'نوع متابعة غير معتمد'; end if;
    note_text := btrim(coalesce(p_payload->>'note',''));
    if length(note_text)<2 or length(note_text)>3000 then raise exception 'أدخل ملاحظة من 2 إلى 3000 حرف'; end if;
    select * into rec from public.leader_private_leads where id=v_id and archived_at is null for update;
    if not found then raise exception 'السجل غير موجود'; end if;
    insert into public.leader_private_lead_events(lead_id,event_type,note,status)
      values(v_id,kind,note_text,rec.status);
    update public.leader_private_leads set
      last_contact_at=case when kind='contact' then now() else last_contact_at end,
      updated_at=now()
      where id=v_id returning * into rec;
    return jsonb_build_object('item',to_jsonb(rec));
  elsif p_action = 'archive' then
    v_id := (p_payload->>'id')::uuid;
    update public.leader_private_leads set archived_at=now(),updated_at=now()
      where id=v_id and archived_at is null returning * into rec;
    if not found then raise exception 'السجل غير موجود'; end if;
    return jsonb_build_object('archived',true);
  end if;
  raise exception 'عملية غير معتمدة';
end;
$$;
revoke all on function public.primary_leader_crm(uuid,text,jsonb) from public;
grant execute on function public.primary_leader_crm(uuid,text,jsonb) to anon, authenticated;
comment on function public.primary_leader_crm(uuid,text,jsonb) is
  'Private primary-LEADER-only lead CRM; every action validates a live application session and exact user ID.';
