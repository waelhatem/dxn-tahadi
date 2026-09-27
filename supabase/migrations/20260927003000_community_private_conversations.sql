begin;

create table if not exists public.community_private_conversations (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.app_users(id) on delete cascade,
  user_b uuid not null references public.app_users(id) on delete cascade,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_private_conversations_users_different check (user_a <> user_b),
  constraint community_private_conversations_users_ordered check (user_a < user_b),
  constraint community_private_conversations_unique_pair unique (user_a, user_b)
);

create index if not exists community_private_conversations_user_a_idx
  on public.community_private_conversations(user_a, last_message_at desc);

create index if not exists community_private_conversations_user_b_idx
  on public.community_private_conversations(user_b, last_message_at desc);

create table if not exists public.community_private_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.community_private_conversations(id) on delete cascade,
  sender_user_id uuid not null references public.app_users(id) on delete cascade,
  recipient_user_id uuid not null references public.app_users(id) on delete cascade,
  message_text text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint community_private_messages_users_different check (sender_user_id <> recipient_user_id),
  constraint community_private_messages_text_required check (length(trim(message_text)) > 0)
);

create index if not exists community_private_messages_conversation_idx
  on public.community_private_messages(conversation_id, created_at desc);

create index if not exists community_private_messages_recipient_unread_idx
  on public.community_private_messages(recipient_user_id, read_at, created_at desc);

create or replace function public.community_private_message_validate_participants()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $
declare
  a uuid;
  b uuid;
begin
  select user_a, user_b into a, b
  from public.community_private_conversations
  where id = new.conversation_id;

  if a is null or b is null
     or not (new.sender_user_id = a or new.sender_user_id = b)
     or not (new.recipient_user_id = a or new.recipient_user_id = b)
     or new.sender_user_id = new.recipient_user_id
  then
    raise exception 'المشاركون في الرسالة غير صالحين';
  end if;

  return new;
end;
$;

drop trigger if exists community_private_message_participants_trg
  on public.community_private_messages;

create trigger community_private_message_participants_trg
before insert or update on public.community_private_messages
for each row execute function public.community_private_message_validate_participants();

alter table public.community_private_conversations enable row level security;
alter table public.community_private_messages enable row level security;

grant usage on schema public to service_role;
grant select, insert, update on public.community_private_conversations to service_role;
grant select, insert, update on public.community_private_messages to service_role;
revoke all on public.community_private_conversations from public, anon, authenticated;
revoke all on public.community_private_messages from public, anon, authenticated;

create or replace function public.community_private_user_search(
  p_token uuid,
  p_query text default '',
  p_limit integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_q text := lower(trim(coalesce(p_query,'')));
  v_limit integer := greatest(1, least(coalesce(p_limit,30),50));
begin
  v_user_id := public.app_current_user_id(p_token);
  if v_user_id is null then
    raise exception 'انتهت الجلسة';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'user_id', q.id,
        'name', q.name,
        'role', q.role,
        'member_no', q.member_no
      )
      order by q.name
    )
    from (
      select
        u.id,
        coalesce(nullif(btrim(u.display_name),''), nullif(btrim(m.name),''), u.login_no) as name,
        u.role,
        coalesce(m.member_no,'') as member_no
      from public.app_users u
      left join public.members m on m.id = u.member_id
      where u.active
        and u.id <> v_user_id
        and (
          v_q = ''
          or lower(coalesce(u.display_name,'')) like '%' || v_q || '%'
          or lower(coalesce(m.name,'')) like '%' || v_q || '%'
          or lower(coalesce(u.login_no,'')) like '%' || v_q || '%'
          or coalesce(m.member_no,'') like '%' || v_q || '%'
        )
      order by coalesce(nullif(btrim(u.display_name),''), nullif(btrim(m.name),''), u.login_no)
      limit v_limit
    ) q
  ), '[]'::jsonb);
end;
$$;

create or replace function public.community_private_conversations_list(
  p_token uuid,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_limit integer := greatest(1, least(coalesce(p_limit,100),100));
begin
  v_user_id := public.app_current_user_id(p_token);
  if v_user_id is null then
    raise exception 'انتهت الجلسة';
  end if;

  return coalesce((
    select jsonb_agg(row_data order by last_message_at desc)
    from (
      select
        jsonb_build_object(
          'conversation_id', c.id,
          'other_user_id', other_u.id,
          'other_name', coalesce(nullif(btrim(other_u.display_name),''), nullif(btrim(other_m.name),''), other_u.login_no),
          'other_role', other_u.role,
          'other_member_no', coalesce(other_m.member_no,''),
          'last_message', lm.message_text,
          'last_message_at', c.last_message_at,
          'unread_count', unread.unread_count
        ) as row_data,
        c.last_message_at,
        unread.unread_count
      from public.community_private_conversations c
      join public.app_users other_u
        on other_u.id = case when c.user_a = v_user_id then c.user_b else c.user_a end
      left join public.members other_m on other_m.id = other_u.member_id
      left join lateral (
        select pm.message_text
        from public.community_private_messages pm
        where pm.conversation_id = c.id
        order by pm.created_at desc
        limit 1
      ) lm on true
      left join lateral (
        select count(*)::integer as unread_count
        from public.community_private_messages um
        where um.conversation_id = c.id
          and um.recipient_user_id = v_user_id
          and um.read_at is null
      ) unread on true
      where c.user_a = v_user_id or c.user_b = v_user_id
      order by unread.unread_count desc, c.last_message_at desc
      limit v_limit
    ) q
  ), '[]'::jsonb);
end;
$$;

create or replace function public.community_private_chat_open(
  p_token uuid,
  p_other_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_conversation_id uuid;
  v_other_name text;
  v_other_role text;
  v_other_member_no text;
begin
  v_user_id := public.app_current_user_id(p_token);
  if v_user_id is null then
    raise exception 'انتهت الجلسة';
  end if;

  if p_other_user_id is null or p_other_user_id = v_user_id then
    raise exception 'المستخدم الآخر غير صالح';
  end if;

  if not exists (
    select 1 from public.app_users u
    where u.id = p_other_user_id and u.active
  ) then
    raise exception 'المستخدم غير متاح';
  end if;

  select c.id
    into v_conversation_id
  from public.community_private_conversations c
  where c.user_a = least(v_user_id, p_other_user_id)
    and c.user_b = greatest(v_user_id, p_other_user_id)
  limit 1;

  if v_conversation_id is null then
    insert into public.community_private_conversations(user_a,user_b)
    values(least(v_user_id,p_other_user_id), greatest(v_user_id,p_other_user_id))
    on conflict (user_a,user_b) do update
      set updated_at = now()
    returning id into v_conversation_id;
  end if;

  update public.community_private_messages
  set read_at = coalesce(read_at, now())
  where conversation_id = v_conversation_id
    and recipient_user_id = v_user_id
    and read_at is null;

  select
    coalesce(nullif(btrim(u.display_name),''), nullif(btrim(m.name),''), u.login_no),
    u.role,
    coalesce(m.member_no,'')
  into v_other_name, v_other_role, v_other_member_no
  from public.app_users u
  left join public.members m on m.id = u.member_id
  where u.id = p_other_user_id;

  return jsonb_build_object(
    'conversation_id', v_conversation_id,
    'current_user_id', v_user_id,
    'other_user_id', p_other_user_id,
    'other_name', v_other_name,
    'other_role', v_other_role,
    'other_member_no', v_other_member_no,
    'messages', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', pm.id,
          'sender_user_id', pm.sender_user_id,
          'recipient_user_id', pm.recipient_user_id,
          'message_text', pm.message_text,
          'created_at', pm.created_at,
          'read_at', pm.read_at
        ) order by pm.created_at asc
      )
      from (
        select *
        from public.community_private_messages pm
        where pm.conversation_id = v_conversation_id
        order by pm.created_at desc
        limit 200
      ) pm
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.community_private_message_send(
  p_token uuid,
  p_other_user_id uuid,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_conversation_id uuid;
  v_message_id uuid;
  v_text text := btrim(coalesce(p_message,''));
begin
  v_user_id := public.app_current_user_id(p_token);
  if v_user_id is null then
    raise exception 'انتهت الجلسة';
  end if;

  if p_other_user_id is null or p_other_user_id = v_user_id then
    raise exception 'المستخدم الآخر غير صالح';
  end if;

  if v_text = '' then
    raise exception 'الرسالة فارغة';
  end if;

  if char_length(v_text) > 2000 then
    raise exception 'الرسالة تتجاوز الحد المسموح';
  end if;

  if not exists (
    select 1 from public.app_users u
    where u.id = p_other_user_id and u.active
  ) then
    raise exception 'المستخدم غير متاح';
  end if;

  insert into public.community_private_conversations(user_a,user_b,last_message_at,updated_at)
  values(least(v_user_id,p_other_user_id), greatest(v_user_id,p_other_user_id), now(), now())
  on conflict (user_a,user_b) do update
    set last_message_at = now(), updated_at = now()
  returning id into v_conversation_id;

  insert into public.community_private_messages(
    conversation_id,sender_user_id,recipient_user_id,message_text
  )
  values(v_conversation_id,v_user_id,p_other_user_id,v_text)
  returning id into v_message_id;

  update public.community_private_conversations
  set last_message_at = now(), updated_at = now()
  where id = v_conversation_id;

  return jsonb_build_object(
    'id', v_message_id,
    'conversation_id', v_conversation_id,
    'sender_user_id', v_user_id,
    'recipient_user_id', p_other_user_id,
    'message_text', v_text,
    'created_at', now(),
    'read_at', null
  );
end;
$$;

revoke all on function public.community_private_user_search(uuid,text,integer) from public, anon, authenticated;
revoke all on function public.community_private_conversations_list(uuid,integer) from public, anon, authenticated;
revoke all on function public.community_private_chat_open(uuid,uuid) from public, anon, authenticated;
revoke all on function public.community_private_message_send(uuid,uuid,text) from public, anon, authenticated;

grant execute on function public.community_private_user_search(uuid,text,integer) to service_role;
grant execute on function public.community_private_conversations_list(uuid,integer) to service_role;
grant execute on function public.community_private_chat_open(uuid,uuid) to service_role;
grant execute on function public.community_private_message_send(uuid,uuid,text) to service_role;

commit;
