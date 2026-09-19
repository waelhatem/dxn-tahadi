-- Sponsor confirmation: allow correction before final lock.
-- Existing sponsor links remain editable until explicitly confirmed.

alter table public.member_sponsor_links
  add column if not exists status text not null default 'pending_confirmation';

alter table public.member_sponsor_links
  add column if not exists confirmed_at timestamptz null;

alter table public.member_sponsor_links
  drop constraint if exists member_sponsor_links_status_check;

alter table public.member_sponsor_links
  add constraint member_sponsor_links_status_check
  check (status in ('pending_confirmation','confirmed'));

create or replace function public.prevent_confirmed_sponsor_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'confirmed'
     and old.sponsor_member_no is distinct from new.sponsor_member_no then
    raise exception 'الراعي المباشر مثبت ولا يمكن تغييره';
  end if;

  if old.status = 'confirmed' and new.status <> 'confirmed' then
    raise exception 'الراعي المباشر مثبت ولا يمكن إلغاء تثبيته';
  end if;

  if new.status = 'confirmed' and new.confirmed_at is null then
    new.confirmed_at := coalesce(old.confirmed_at, now());
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_confirmed_sponsor_change
on public.member_sponsor_links;

create trigger trg_prevent_confirmed_sponsor_change
before update on public.member_sponsor_links
for each row
execute function public.prevent_confirmed_sponsor_change();

create or replace function public.get_member_sponsor_link(p_token uuid)
returns table (
  sponsor_member_no text,
  sponsor_name text,
  status text,
  confirmed_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
begin
  uid := public.current_user_id(p_token);
  if uid is null then
    raise exception 'جلسة الدخول غير صالحة';
  end if;

  return query
  select
    l.sponsor_member_no,
    coalesce(
      to_jsonb(m)->>'full_name',
      to_jsonb(m)->>'member_name',
      to_jsonb(m)->>'display_name',
      to_jsonb(m)->>'name',
      l.sponsor_member_no
    ) as sponsor_name,
    l.status,
    l.confirmed_at,
    l.updated_at
  from public.member_sponsor_links l
  left join public.members m
    on trim(coalesce(m.member_no::text,'')) = l.sponsor_member_no
  where l.user_id = uid;
end;
$$;

create or replace function public.set_member_sponsor_link(
  p_token uuid,
  p_sponsor_member_no text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  sponsor_no text;
  existing_status text;
  existing_sponsor text;
begin
  uid := public.current_user_id(p_token);
  if uid is null then
    raise exception 'جلسة الدخول غير صالحة';
  end if;

  sponsor_no := trim(coalesce(p_sponsor_member_no,''));

  if sponsor_no = '' then
    raise exception 'أدخل رقم عضوية الراعي';
  end if;

  if length(sponsor_no) > 80 then
    raise exception 'رقم العضوية غير صالح';
  end if;

  if not exists (
    select 1
    from public.members m
    where trim(coalesce(m.member_no::text,'')) = sponsor_no
  ) then
    raise exception 'رقم الراعي غير موجود في سجل الأعضاء';
  end if;

  select l.status, l.sponsor_member_no
    into existing_status, existing_sponsor
  from public.member_sponsor_links l
  where l.user_id = uid
  for update;

  if existing_status = 'confirmed' then
    if existing_sponsor is distinct from sponsor_no then
      raise exception 'الراعي المباشر مثبت ولا يمكن تغييره';
    end if;

    return jsonb_build_object(
      'ok', true,
      'status', 'confirmed',
      'sponsor_member_no', existing_sponsor
    );
  end if;

  insert into public.member_sponsor_links(
    user_id,
    sponsor_member_no,
    status,
    confirmed_at,
    updated_at
  )
  values (
    uid,
    sponsor_no,
    'pending_confirmation',
    null,
    now()
  )
  on conflict (user_id)
  do update set
    sponsor_member_no = excluded.sponsor_member_no,
    status = 'pending_confirmation',
    confirmed_at = null,
    updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'status', 'pending_confirmation',
    'sponsor_member_no', sponsor_no
  );
end;
$$;

create or replace function public.confirm_member_sponsor_link(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  sponsor_no text;
  current_status text;
begin
  uid := public.current_user_id(p_token);
  if uid is null then
    raise exception 'جلسة الدخول غير صالحة';
  end if;

  select l.sponsor_member_no, l.status
    into sponsor_no, current_status
  from public.member_sponsor_links l
  where l.user_id = uid
  for update;

  if sponsor_no is null then
    raise exception 'أدخل رقم الراعي أولًا';
  end if;

  if current_status = 'confirmed' then
    return jsonb_build_object(
      'ok', true,
      'status', 'confirmed',
      'sponsor_member_no', sponsor_no
    );
  end if;

  if not exists (
    select 1
    from public.members m
    where trim(coalesce(m.member_no::text,'')) = sponsor_no
  ) then
    raise exception 'رقم الراعي غير موجود في سجل الأعضاء';
  end if;

  update public.member_sponsor_links
  set status = 'confirmed',
      confirmed_at = now(),
      updated_at = now()
  where user_id = uid;

  return jsonb_build_object(
    'ok', true,
    'status', 'confirmed',
    'sponsor_member_no', sponsor_no
  );
end;
$$;

revoke all on function public.prevent_confirmed_sponsor_change() from public, anon, authenticated;
revoke all on function public.get_member_sponsor_link(uuid) from public, anon, authenticated;
revoke all on function public.set_member_sponsor_link(uuid,text) from public, anon, authenticated;
revoke all on function public.confirm_member_sponsor_link(uuid) from public, anon, authenticated;

grant execute on function public.get_member_sponsor_link(uuid) to anon, authenticated;
grant execute on function public.set_member_sponsor_link(uuid,text) to anon, authenticated;
grant execute on function public.confirm_member_sponsor_link(uuid) to anon, authenticated;
