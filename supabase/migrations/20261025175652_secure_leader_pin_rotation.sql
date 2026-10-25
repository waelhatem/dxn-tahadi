-- Leader PIN rotation (draft; do not apply to production until approved).
-- The site uses custom app_users/sessions authentication, not Supabase Auth.
-- A successful rotation atomically creates one new session and removes every
-- older leader session. A failing check leaves the credentials unchanged.

create or replace function public.leader_rotate_pin(
  p_token uuid,
  p_current_pin text,
  p_new_pin text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_current_hash text;
  v_new_token uuid;
  v_revoked_count integer;
begin
  if p_token is null or p_current_pin is null or p_new_pin is null then
    raise exception 'بيانات تغيير كلمة المرور غير مكتملة';
  end if;

  -- Lock the leader account so concurrent rotations cannot interleave.
  select u.id, u.pin_hash
    into v_user_id, v_current_hash
  from public.sessions s
  join public.app_users u on u.id = s.user_id
  where s.token = p_token
    and s.expires_at > now()
    and u.active = true
    and u.role = 'leader'
  for update of u;

  if v_user_id is null then
    raise exception 'جلسة القائد غير صالحة؛ أعد تسجيل الدخول';
  end if;

  if crypt(p_current_pin, v_current_hash) is distinct from v_current_hash then
    raise exception 'كلمة المرور الحالية غير صحيحة';
  end if;

  -- bcrypt ignores bytes beyond 72; prohibit silent truncation.
  if char_length(p_new_pin) < 12 or octet_length(p_new_pin) > 72 then
    raise exception 'يجب أن تتكون كلمة المرور الجديدة من 12 حرفًا على الأقل وألا تتجاوز 72 بايت';
  end if;

  if crypt(p_new_pin, v_current_hash) = v_current_hash then
    raise exception 'استخدم كلمة مرور جديدة تختلف عن الحالية';
  end if;

  update public.app_users
    set pin_hash = crypt(p_new_pin, gen_salt('bf', 12))
  where id = v_user_id;

  -- Issue a fresh valid leader session *inside the same transaction* before
  -- revoking every other token, including the token used for this request.
  insert into public.sessions(user_id)
  values (v_user_id)
  returning token into v_new_token;

  delete from public.sessions
  where user_id = v_user_id and token <> v_new_token;
  get diagnostics v_revoked_count = row_count;

  if to_regclass('public.audit_log') is not null then
    execute 'insert into public.audit_log(actor_user_id,action,target_type,target_id) values ($1, $2, $3, $4)'
      using v_user_id, 'leader_rotate_pin', 'app_user', v_user_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'token', v_new_token,
    'revoked_sessions', v_revoked_count
  );
end;
$$;

-- Browser sessions must use the same-origin, server-side API, which calls
-- this function with the configured secret key. Do not expose it to anon.
revoke all on function public.leader_rotate_pin(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.leader_rotate_pin(uuid, text, text)
  to service_role;

-- Block the legacy one-factor change_pin RPC for leader accounts while
-- keeping its original behavior for ordinary members.
create or replace function public.change_pin(p_token uuid, p_new_pin text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_role text;
begin
  v_user_id := public.current_user_id(p_token);
  if v_user_id is null then
    raise exception 'انتهت الجلسة';
  end if;

  select role into v_role from public.app_users where id = v_user_id;
  if v_role = 'leader' then
    raise exception 'استخدم إعدادات أمان حساب القائد لتغيير كلمة المرور';
  end if;

  if length(trim(p_new_pin)) < 4 then
    raise exception 'PIN قصير جداً';
  end if;

  update public.app_users
  set pin_hash = crypt(trim(p_new_pin), gen_salt('bf'))
  where id = v_user_id;

  if to_regclass('public.audit_log') is not null then
    execute 'insert into public.audit_log(actor_user_id,action,target_type,target_id) values ($1, $2, $3, $4)'
      using v_user_id, 'change_pin', 'app_user', v_user_id;
  end if;
end;
$$;
