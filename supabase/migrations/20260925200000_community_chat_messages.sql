create table if not exists public.community_chat_messages (
  id uuid primary key default gen_random_uuid(),
  sender_member_no text not null default '',
  sender_name text not null default '',
  sender_role text not null default 'member' check (sender_role in ('member','leader')),
  message_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_chat_messages_text_required check (length(trim(message_text)) > 0)
);

create index if not exists community_chat_messages_created_at_idx
  on public.community_chat_messages (created_at desc);

alter table public.community_chat_messages enable row level security;

grant usage on schema public to service_role;
grant select, insert, update on table public.community_chat_messages to service_role;
grant select on table public.community_chat_messages to authenticated;
