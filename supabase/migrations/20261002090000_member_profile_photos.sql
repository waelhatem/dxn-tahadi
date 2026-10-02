-- Member profile photos: durable history with one active photo per member.
-- Files live in Supabase Storage bucket "member-profiles".
-- This migration does not delete any existing member data or historical records.

create table if not exists public.member_profile_photos (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  storage_path text not null,
  public_url text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0),
  active boolean not null default true,
  uploaded_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists member_profile_photos_member_idx
  on public.member_profile_photos(member_id, created_at desc);

create unique index if not exists member_profile_photos_one_active_idx
  on public.member_profile_photos(member_id)
  where active = true;

alter table public.member_profile_photos enable row level security;
revoke all on table public.member_profile_photos from public, anon, authenticated;

create or replace view public.member_stats as
select
  m.id,
  m.member_no,
  m.name,
  m.team_id,
  m.stars,
  m.active,
  t.name as team_name,
  coalesce((
    select p.public_url
    from public.member_profile_photos p
    where p.member_id = m.id
      and p.active = true
    order by p.created_at desc
    limit 1
  ), '') as profile_photo_url,
  coalesce((
    select p.storage_path
    from public.member_profile_photos p
    where p.member_id = m.id
      and p.active = true
    order by p.created_at desc
    limit 1
  ), '') as profile_photo_path,
  count(cs.id) filter (where cs.status='approved') as approved_challenges
from public.members m
left join public.teams t on t.id=m.team_id
left join public.challenge_submissions cs on cs.member_id=m.id
group by m.id,t.name;

create or replace function public.save_member_profile_photo(
  p_token uuid,
  p_member uuid,
  p_storage_path text,
  p_public_url text,
  p_mime_type text,
  p_file_size bigint
)
returns public.member_profile_photos
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid;
  r public.member_profile_photos;
  clean_path text := trim(coalesce(p_storage_path,''));
  clean_url text := trim(coalesce(p_public_url,''));
  clean_type text := lower(trim(coalesce(p_mime_type,'')));
begin
  uid := public.current_user_id(p_token);
  if uid is null or public.current_role(p_token) not in ('member','leader') then
    raise exception 'انتهت الجلسة أو غير مصرح';
  end if;

  if not exists(select 1 from public.members m where m.id=p_member and m.active=true) then
    raise exception 'العضو غير موجود أو غير نشط';
  end if;

  if public.current_role(p_token)='member'
     and not exists(select 1 from public.app_users u where u.id=uid and u.member_id=p_member) then
    raise exception 'لا يمكنك تغيير صورة عضو آخر';
  end if;

  if clean_path = '' or clean_url = '' then
    raise exception 'بيانات الصورة ناقصة';
  end if;

  if clean_path !~ ('^'||p_member::text||'/') then
    raise exception 'مسار الصورة غير صالح';
  end if;

  if clean_type not in ('image/jpeg','image/png','image/webp') then
    raise exception 'نوع الصورة غير مدعوم';
  end if;

  if p_file_size is null or p_file_size <= 0 or p_file_size > 10*1024*1024 then
    raise exception 'حجم الصورة يجب ألا يتجاوز 10 MB';
  end if;

  update public.member_profile_photos
     set active=false
   where member_id=p_member
     and active=true;

  insert into public.member_profile_photos(
    member_id,storage_path,public_url,mime_type,file_size,active,uploaded_by
  )
  values(
    p_member,clean_path,clean_url,clean_type,p_file_size,true,uid
  )
  returning * into r;

  return r;
end;
$$;

revoke all on function public.save_member_profile_photo(uuid,uuid,text,text,text,bigint)
from public, anon, authenticated;

grant execute on function public.save_member_profile_photo(uuid,uuid,text,text,text,bigint)
to anon, authenticated;

-- Include the active photo in the member object returned by login.
create or replace function public.login(p_login_no text,p_pin text)
returns json language plpgsql security definer set search_path=public as $$
declare u public.app_users; s uuid; m public.members; t public.teams; photo_url text;
begin
  select * into u from app_users where login_no=trim(p_login_no) and active;
  if u.id is null or crypt(p_pin,u.pin_hash)<>u.pin_hash then
    raise exception 'بيانات الدخول غير صحيحة';
  end if;
  insert into sessions(user_id) values(u.id) returning token into s;
  if u.member_id is not null then
    select * into m from members where id=u.member_id;
    select * into t from teams where id=m.team_id;
    select coalesce((
      select p.public_url from public.member_profile_photos p
      where p.member_id=m.id and p.active=true
      order by p.created_at desc limit 1
    ),'') into photo_url;
  end if;
  return json_build_object(
    'token',s,
    'role',u.role,
    'user_id',u.id,
    'member',case when m.id is null then null else json_build_object(
      'id',m.id,
      'member_no',m.member_no,
      'name',m.name,
      'team_id',m.team_id,
      'team_name',t.name,
      'stars',m.stars,
      'profile_photo_url',photo_url
    ) end
  );
end $$;

notify pgrst, 'reload schema';
