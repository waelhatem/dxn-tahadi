-- V86.46.15 — إصلاح وظيفة إخفاء نتيجة التدريب من لوحة القائد
-- لا تحذف الإجابة أو النتيجة من حساب العضو.

create or replace function public.leader_hide_training_answer(
  p_token uuid,
  p_answer_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  s record;
begin
  select au.id as user_id, au.role
    into s
  from sessions ss
  join app_users au on au.id=ss.user_id
  where ss.token=p_token
    and ss.expires_at>now()
    and au.active=true
  limit 1;

  if not found or s.role<>'leader' then
    raise exception using errcode='P0001',message='غير مصرح للقائد';
  end if;

  update training_answers
  set leader_hidden_at=coalesce(leader_hidden_at,now())
  where id=p_answer_id;

  if not found then
    raise exception using errcode='P0001',message='نتيجة الاختبار غير موجودة';
  end if;

  return jsonb_build_object('ok',true,'answer_id',p_answer_id);
end $$;

grant execute on function public.leader_hide_training_answer(uuid,uuid) to anon,authenticated;

notify pgrst, 'reload schema';
