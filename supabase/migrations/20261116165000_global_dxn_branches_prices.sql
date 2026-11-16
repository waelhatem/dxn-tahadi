-- Global DXN branches and price-list directory; independent of training/team data.
begin;

create table if not exists public.dxn_directory_countries (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null check (char_length(btrim(name_ar)) between 2 and 100),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
create unique index if not exists dxn_directory_country_name_uq
  on public.dxn_directory_countries (lower(btrim(name_ar)));

create table if not exists public.dxn_directory_branches (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references public.dxn_directory_countries(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 2 and 160),
  city text not null check (char_length(btrim(city)) between 2 and 120),
  address text not null check (char_length(btrim(address)) between 3 and 500),
  phone text not null default '',
  latitude numeric(10,7) not null check (latitude between -90 and 90),
  longitude numeric(10,7) not null check (longitude between -180 and 180),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
create index if not exists dxn_directory_branches_country_idx
  on public.dxn_directory_branches(country_id, city, name);

create table if not exists public.dxn_directory_prices (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references public.dxn_directory_countries(id) on delete restrict,
  branch_id uuid references public.dxn_directory_branches(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 3 and 160),
  file_name text not null check (char_length(btrim(file_name)) between 5 and 200),
  object_path text not null,
  file_size bigint not null check (file_size between 1 and 20971520),
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  uploaded_by uuid not null references public.app_users(id)
);
create index if not exists dxn_directory_prices_country_idx
  on public.dxn_directory_prices(country_id, updated_at desc);

alter table public.dxn_directory_countries enable row level security;
alter table public.dxn_directory_branches enable row level security;
alter table public.dxn_directory_prices enable row level security;
revoke all on public.dxn_directory_countries from public, anon, authenticated;
revoke all on public.dxn_directory_branches from public, anon, authenticated;
revoke all on public.dxn_directory_prices from public, anon, authenticated;
grant select,insert,update,delete on public.dxn_directory_countries to service_role;
grant select,insert,update,delete on public.dxn_directory_branches to service_role;
grant select,insert,update,delete on public.dxn_directory_prices to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('dxn-directory-pdfs','dxn-directory-pdfs',false,20971520,array['application/pdf'])
on conflict(id) do update set public=false,file_size_limit=20971520,allowed_mime_types=array['application/pdf'];

create or replace function public.dxn_directory_list(p_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid; is_leader boolean; result jsonb;
begin
  uid:=public.app_current_user_id(p_token);
  if uid is null then raise exception 'انتهت الجلسة، يرجى تسجيل الدخول'; end if;
  is_leader:=coalesce(public.app_current_role(p_token)='leader',false);
  select jsonb_build_object(
    'is_leader',is_leader,
    'countries',coalesce((
      select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name_ar,'active',c.active) order by c.name_ar)
      from public.dxn_directory_countries c
      where is_leader or c.active
    ),'[]'::jsonb),
    'branches',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',b.id,'country_id',b.country_id,'name',b.name,'city',b.city,
        'address',b.address,'phone',b.phone,'latitude',b.latitude,'longitude',b.longitude,
        'active',b.active
      ) order by b.city,b.name)
      from public.dxn_directory_branches b
      join public.dxn_directory_countries c on c.id=b.country_id
      where is_leader or (b.active and c.active)
    ),'[]'::jsonb),
    'prices',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',p.id,'country_id',p.country_id,'branch_id',p.branch_id,
        'title',p.title,'file_name',p.file_name,'file_size',p.file_size,
        'updated_at',p.updated_at,'active',p.active
      ) order by p.updated_at desc)
      from public.dxn_directory_prices p
      join public.dxn_directory_countries c on c.id=p.country_id
      where is_leader or (p.active and c.active
        and (p.branch_id is null or exists(select 1 from public.dxn_directory_branches b where b.id=p.branch_id and b.active)))
    ),'[]'::jsonb)
  ) into result;
  return result;
end $$;
revoke all on function public.dxn_directory_list(uuid) from public, anon, authenticated;
grant execute on function public.dxn_directory_list(uuid) to anon,authenticated;

create or replace function public.dxn_directory_manage(
  p_token uuid,p_entity text,p_action text,p_payload jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  uid uuid; rid uuid; cid uuid; bid uuid; path text; obj storage.objects%rowtype;
  bytes bigint; out_id uuid;
begin
  uid:=public.app_current_user_id(p_token);
  if uid is null or public.app_current_role(p_token)<>'leader' then
    raise exception 'هذا الإجراء متاح للقائد فقط';
  end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'البيانات غير صالحة'; end if;
  rid:=nullif(p_payload->>'id','')::uuid;
  if p_action='delete' then
    if rid is null then raise exception 'المعرّف مطلوب للحذف';end if;
    if p_entity='country' then
      if exists(select 1 from public.dxn_directory_branches where country_id=rid)
        or exists(select 1 from public.dxn_directory_prices where country_id=rid)
      then raise exception 'احذف الفروع والقوائم التابعة أولاً';end if;
      delete from public.dxn_directory_countries where id=rid;
    elsif p_entity='branch' then
      delete from public.dxn_directory_branches where id=rid;
    elsif p_entity='price' then
      delete from public.dxn_directory_prices where id=rid;
    else raise exception 'نوع السجل غير صالح';end if;
    return jsonb_build_object('ok',true,'deleted_id',rid);
  end if;
  if p_action<>'save' then raise exception 'الإجراء غير صالح';end if;
  out_id:=coalesce(rid,gen_random_uuid());
  if p_entity='country' then
    insert into public.dxn_directory_countries(id,name_ar,active)
    values(out_id,btrim(coalesce(p_payload->>'name','')),coalesce((p_payload->>'active')::boolean,true))
    on conflict(id) do update set name_ar=excluded.name_ar,active=excluded.active,updated_at=now();
  elsif p_entity='branch' then
    cid:=nullif(p_payload->>'country_id','')::uuid;
    if not exists(select 1 from public.dxn_directory_countries where id=cid) then raise exception 'اختر دولة صحيحة';end if;
    insert into public.dxn_directory_branches(id,country_id,name,city,address,phone,latitude,longitude,active)
    values(out_id,cid,btrim(coalesce(p_payload->>'name','')),
      btrim(coalesce(p_payload->>'city','')),btrim(coalesce(p_payload->>'address','')),
      btrim(coalesce(p_payload->>'phone','')),
      nullif(p_payload->>'latitude','')::numeric,nullif(p_payload->>'longitude','')::numeric,
      coalesce((p_payload->>'active')::boolean,true))
    on conflict(id) do update set country_id=excluded.country_id,name=excluded.name,
      city=excluded.city,address=excluded.address,phone=excluded.phone,latitude=excluded.latitude,
      longitude=excluded.longitude,active=excluded.active,updated_at=now();
  elsif p_entity='price' then
    cid:=nullif(p_payload->>'country_id','')::uuid;
    bid:=nullif(p_payload->>'branch_id','')::uuid;
    path:=btrim(coalesce(p_payload->>'object_path',''));
    bytes:=nullif(p_payload->>'file_size','')::bigint;
    if not exists(select 1 from public.dxn_directory_countries where id=cid) then raise exception 'اختر دولة صحيحة';end if;
    if bid is not null and not exists(select 1 from public.dxn_directory_branches
      where id=bid and country_id=cid) then raise exception 'الفرع لا يتبع الدولة المختارة';end if;
    if path !~ ('^leader/'||uid::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$')
    then raise exception 'مسار ملف PDF غير صالح';end if;
    select * into obj from storage.objects where bucket_id='dxn-directory-pdfs' and name=path limit 1;
    if obj.id is null then raise exception 'لم يكتمل رفع ملف PDF';end if;
    if bytes is null or bytes<1 or bytes>20971520 or
      nullif(obj.metadata->>'size','')::bigint is distinct from bytes
    then raise exception 'حجم ملف PDF غير صالح أو غير مطابق';end if;
    insert into public.dxn_directory_prices(id,country_id,branch_id,title,file_name,object_path,file_size,active,uploaded_by)
    values(out_id,cid,bid,btrim(coalesce(p_payload->>'title','')),
      btrim(coalesce(p_payload->>'file_name','')),path,bytes,
      coalesce((p_payload->>'active')::boolean,true),uid)
    on conflict(id) do update set country_id=excluded.country_id,branch_id=excluded.branch_id,
      title=excluded.title,file_name=excluded.file_name,object_path=excluded.object_path,
      file_size=excluded.file_size,active=excluded.active,updated_at=now(),uploaded_by=uid;
  else raise exception 'نوع السجل غير صالح';end if;
  return jsonb_build_object('ok',true,'id',out_id);
end $$;
revoke all on function public.dxn_directory_manage(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.dxn_directory_manage(uuid,text,text,jsonb) to anon,authenticated;
notify pgrst,'reload schema';
commit;
