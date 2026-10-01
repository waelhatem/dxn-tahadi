-- R2 upload lookup used only by the server-side completion check.
create or replace function public.get_academy_video_upload(p_token uuid,p_video_id uuid)
returns table(id uuid,object_key text,file_size bigint,content_type text,status text)
language plpgsql
security definer
set search_path=public
as $function$
declare uid uuid; role_name text;
begin
  select s.user_id,lower(u.role) into uid,role_name
  from public.sessions s join public.app_users u on u.id=s.user_id
  where s.token=p_token and s.expires_at>now() and u.active=true limit 1;
  if uid is null then raise exception 'انتهت الجلسة'; end if;
  if role_name<>'leader' then raise exception 'إدارة فيديوهات الأكاديمية متاحة للقائد فقط'; end if;

  return query
    select v.id,v.object_key,v.file_size,v.content_type,v.status
    from public.academy_videos v
    where v.id=p_video_id and v.created_by=uid and v.status='draft';
end;
$function$;

revoke all on function public.get_academy_video_upload(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_academy_video_upload(uuid,uuid) to service_role;
notify pgrst,'reload schema';
