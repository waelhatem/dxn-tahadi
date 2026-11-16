-- Additional official branch details supplied by the community leader on 2026-11-16.
-- Map URLs open a location, not the member's navigation route. No invented GPS coordinates.
begin;
alter table public.dxn_directory_countries
  add column if not exists whatsapp_channel_url text not null default '';
alter table public.dxn_directory_branches
  add column if not exists maps_url text not null default '',
  add column if not exists working_hours text not null default '',
  add column if not exists delivery_phone text not null default '';

do $checks$
begin
 if not exists(select 1 from pg_constraint where conname='dxn_directory_country_channel_valid') then
  alter table public.dxn_directory_countries
   add constraint dxn_directory_country_channel_valid check (
    char_length(whatsapp_channel_url)<=500
    and (whatsapp_channel_url='' or whatsapp_channel_url ~ '^https://(www[.])?whatsapp[.]com/channel/[A-Za-z0-9]+/?$')
   );
 end if;
 if not exists(select 1 from pg_constraint where conname='dxn_directory_branch_maps_url_valid') then
  alter table public.dxn_directory_branches
   add constraint dxn_directory_branch_maps_url_valid check (
    char_length(maps_url)<=500
    and (maps_url='' or maps_url ~ '^https://(maps[.]app[.]goo[.]gl/|www[.]google[.]com/maps/|google[.]com/maps/)')
   );
 end if;
 if not exists(select 1 from pg_constraint where conname='dxn_directory_branch_contact_lengths') then
  alter table public.dxn_directory_branches
   add constraint dxn_directory_branch_contact_lengths check (
    char_length(working_hours)<=400 and char_length(delivery_phone)<=55
   );
 end if;
end $checks$;

update public.dxn_directory_countries set
 whatsapp_channel_url='https://whatsapp.com/channel/0029Vb7Lwuz2v1IqZvisWx3H',
 updated_at=now()
where name_ar='سوريا';
update public.dxn_directory_branches b set
 maps_url='https://maps.app.goo.gl/rRh8XYkJrZygpt7F8?g_st=ac',
 working_hours='السبت إلى الخميس، 9:00 صباحًا – 6:00 مساءً',
 delivery_phone='00963987190019',
 updated_at=now()
from public.dxn_directory_countries c
where b.country_id=c.id and c.name_ar='سوريا' and b.name='المركز الرئيسي' and b.city='دمشق';

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
      select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name_ar,'active',c.active,'whatsapp_channel_url',c.whatsapp_channel_url) order by c.name_ar)
      from public.dxn_directory_countries c
      where is_leader or c.active
    ),'[]'::jsonb),
    'branches',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',b.id,'country_id',b.country_id,'name',b.name,'city',b.city,
        'address',b.address,'phone',b.phone,'latitude',b.latitude,'longitude',b.longitude,
        'maps_url',b.maps_url,'working_hours',b.working_hours,'delivery_phone',b.delivery_phone,
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
    insert into public.dxn_directory_countries(id,name_ar,active,whatsapp_channel_url)
    values(out_id,btrim(coalesce(p_payload->>'name','')),coalesce((p_payload->>'active')::boolean,true),
      btrim(coalesce(p_payload->>'whatsapp_channel_url','')))
    on conflict(id) do update set name_ar=excluded.name_ar,active=excluded.active,
      whatsapp_channel_url=excluded.whatsapp_channel_url,updated_at=now();
  elsif p_entity='branch' then
    cid:=nullif(p_payload->>'country_id','')::uuid;
    if not exists(select 1 from public.dxn_directory_countries where id=cid) then raise exception 'اختر دولة صحيحة';end if;
    insert into public.dxn_directory_branches(id,country_id,name,city,address,phone,latitude,longitude,active,maps_url,working_hours,delivery_phone)
    values(out_id,cid,btrim(coalesce(p_payload->>'name','')),
      btrim(coalesce(p_payload->>'city','')),btrim(coalesce(p_payload->>'address','')),
      btrim(coalesce(p_payload->>'phone','')),
      nullif(p_payload->>'latitude','')::numeric,nullif(p_payload->>'longitude','')::numeric,
      coalesce((p_payload->>'active')::boolean,true),
      btrim(coalesce(p_payload->>'maps_url','')),
      btrim(coalesce(p_payload->>'working_hours','')),
      btrim(coalesce(p_payload->>'delivery_phone','')))
    on conflict(id) do update set country_id=excluded.country_id,name=excluded.name,
      city=excluded.city,address=excluded.address,phone=excluded.phone,latitude=excluded.latitude,
      longitude=excluded.longitude,active=excluded.active,
      maps_url=excluded.maps_url,working_hours=excluded.working_hours,delivery_phone=excluded.delivery_phone,
      updated_at=now();
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
