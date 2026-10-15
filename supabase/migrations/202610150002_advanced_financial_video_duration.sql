-- Explicit leader-only duration verification from YouTube iframe API.
-- Existing advanced training sessions are never recalculated on duration changes.
create or replace function public.advanced_financial_verify_duration(
 p_token uuid,p_lesson_no integer,p_duration integer
) returns jsonb
language plpgsql security definer set search_path to public,pg_temp as $$
declare v_user uuid; v_old integer; v_seconds integer;
begin
 v_user:=public.app_current_user_id(p_token);
 if v_user is null or not exists(
  select 1 from public.app_users where id=v_user and active=true and role='leader'
 ) then raise exception 'هذه العملية للقائد فقط'; end if;
 if p_lesson_no is null or p_lesson_no not between 1 and 10
 or p_duration is null or p_duration<60 or p_duration>14400
 then raise exception 'رقم الدرس أو مدته غير صحيح'; end if;
 v_seconds:=round(p_duration)::integer;
 select expected_duration_seconds into v_old
 from public.advanced_financial_lessons
 where lesson_no=p_lesson_no for update;
 if not found then raise exception 'الدرس غير موجود'; end if;
 if v_old>0 and abs(v_old-v_seconds)>3 and exists(
  select 1 from public.advanced_financial_progress where lesson_no=p_lesson_no
 ) then raise exception 'لا يمكن تغيير مدة درس بدأ فيه الأعضاء'; end if;
 update public.advanced_financial_lessons set
 expected_duration_seconds=v_seconds,updated_at=now()
 where lesson_no=p_lesson_no;
 return jsonb_build_object('lesson_no',p_lesson_no,'duration',v_seconds,'verified',true);
end $$;
revoke all on function public.advanced_financial_verify_duration(uuid,integer,integer) from public;
grant execute on function public.advanced_financial_verify_duration(uuid,integer,integer) to anon,authenticated,service_role;
