-- Restore the leader action used by the Members screen to change a member PIN.
-- The browser already calls change_member_pin(p_token, p_member, p_new_pin).
-- Keep authorization token-based and use the same bcrypt/crypt scheme as login().

create or replace function public.change_member_pin(
  p_token uuid,
  p_member uuid,
  p_new_pin text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  target_user_id uuid;
  new_pin text := trim(coalesce(p_new_pin, ''));
begin
  uid := public.app_current_user_id(p_token);

  if uid is null or public.app_current_role(p_token) <> 'leader' then
    raise exception 'غير مصرح';
  end if;

  if p_member is null then
    raise exception 'العضو غير محدد';
  end if;

  if new_pin = '' then
    raise exception 'PIN الجديد مطلوب';
  end if;

  if char_length(new_pin) < 4 then
    raise exception 'PIN يجب أن يكون 4 أحرف/أرقام على الأقل';
  end if;

  if char_length(new_pin) > 128 then
    raise exception 'PIN طويل جدًا';
  end if;

  select u.id
    into target_user_id
  from public.app_users u
  where u.member_id = p_member
    and u.role = 'member'
    and u.active = true
  limit 1;

  if target_user_id is null then
    raise exception 'حساب العضو غير موجود';
  end if;

  update public.app_users
  set pin_hash = crypt(new_pin, gen_salt('bf'))
  where id = target_user_id;
end;
$$;

revoke all on function public.change_member_pin(uuid, uuid, text)
from public, anon, authenticated;

grant execute on function public.change_member_pin(uuid, uuid, text)
to anon, authenticated;

notify pgrst, 'reload schema';
