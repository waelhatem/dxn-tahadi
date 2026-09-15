-- V86.46.19 — إصلاح الحذف النهائي الفردي وفق بنية Phase-1 الفعلية.
-- public.training_questions تستخدم lesson_no مباشرة ولا تعتمد على assessment_id.
-- الحذف يطال عضوًا واحدًا وتدريبًا واحدًا فقط.

create or replace function public.leader_delete_member_training_answers(
  p_token uuid,
  p_member_id uuid,
  p_lesson_no integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
  deleted_count integer := 0;
begin
  select au.id as user_id, au.role
    into s
  from public.sessions ss
  join public.app_users au on au.id = ss.user_id
  where ss.token = p_token
    and ss.expires_at > now()
    and au.active = true
  limit 1;

  if not found or s.role <> 'leader' then
    raise exception using
      errcode = 'P0001',
      message = 'غير مصرح للقائد';
  end if;

  delete from public.training_answers ta
  using public.training_questions q
  where ta.member_id = p_member_id
    and ta.question_id = q.id
    and q.lesson_no = p_lesson_no;

  get diagnostics deleted_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'member_id', p_member_id,
    'lesson_no', p_lesson_no,
    'deleted_count', deleted_count
  );
end;
$$;

grant execute on function public.leader_delete_member_training_answers(uuid, uuid, integer)
to anon, authenticated;

notify pgrst, 'reload schema';
