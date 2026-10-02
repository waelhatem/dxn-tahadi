-- Member profile photos: store only the Storage object path in the member record.
alter table public.members
  add column if not exists profile_photo_path text;

create or replace function public.list_profile_photos(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  r text;
  uid uuid;
  memberid uuid;
begin
  uid := public.app_current_user_id(p_token);
  r := public.app_current_role(p_token);
  if uid is null or r is null then
    raise exception 'انتهت الجلسة';
  end if;

  if r='member' then
    select member_id into memberid from public.app_users where id=uid and active;
    return coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',m.id,
        'member_no',m.member_no,
        'profile_photo_path',m.profile_photo_path
      ))
      from public.members m
      where m.id=memberid and m.active
    ), '[]'::jsonb);
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',m.id,
      'member_no',m.member_no,
      'profile_photo_path',m.profile_photo_path
    ) order by m.name)
    from public.members m
    where m.active
  ), '[]'::jsonb);
end;
$$;

create or replace function public.set_profile_photo(
  p_token uuid,
  p_member uuid,
  p_path text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid;
  r text;
  own_member uuid;
  member_no_value text;
  old_path text;
  clean_path text;
begin
  uid := public.app_current_user_id(p_token);
  r := public.app_current_role(p_token);
  if uid is null or r is null then
    raise exception 'انتهت الجلسة';
  end if;

  select member_id into own_member
  from public.app_users
  where id=uid and active;

  if p_member is null then
    raise exception 'العضو غير محدد';
  end if;

  select member_no, profile_photo_path
    into member_no_value, old_path
  from public.members
  where id=p_member and active;

  if member_no_value is null then
    raise exception 'العضو غير موجود';
  end if;

  if r='member' and own_member<>p_member then
    raise exception 'يمكنك تعديل صورتك الشخصية فقط';
  end if;
  if r not in ('member','leader') then
    raise exception 'غير مصرح';
  end if;

  clean_path := nullif(trim(coalesce(p_path,'')),'');

  if clean_path is not null
     and position(member_no_value || '/' in clean_path) <> 1
  then
    raise exception 'مسار الصورة غير صالح';
  end if;

  if clean_path is not null
     and substring(clean_path from length(member_no_value)+2) !~ '^[0-9]{10,}-[a-z0-9]+-[A-Za-z0-9._-]+

  update public.members
     set profile_photo_path=clean_path
   where id=p_member;

  return jsonb_build_object(
    'ok',true,
    'member_id',p_member,
    'member_no',member_no_value,
    'profile_photo_path',clean_path,
    'old_profile_photo_path',old_path
  );
end;
$$;

revoke all on function public.list_profile_photos(uuid) from public, anon, authenticated;
revoke all on function public.set_profile_photo(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.list_profile_photos(uuid) to anon, authenticated;
grant execute on function public.set_profile_photo(uuid,uuid,text) to anon, authenticated;

notify pgrst, 'reload schema';

  then
    raise exception 'اسم الصورة غير صالح';
  end if;

  update public.members
     set profile_photo_path=clean_path
   where id=p_member;

  return jsonb_build_object(
    'ok',true,
    'member_id',p_member,
    'member_no',member_no_value,
    'profile_photo_path',clean_path,
    'old_profile_photo_path',old_path
  );
end;
$$;

revoke all on function public.list_profile_photos(uuid) from public, anon, authenticated;
revoke all on function public.set_profile_photo(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.list_profile_photos(uuid) to anon, authenticated;
grant execute on function public.set_profile_photo(uuid,uuid,text) to anon, authenticated;

notify pgrst, 'reload schema';
