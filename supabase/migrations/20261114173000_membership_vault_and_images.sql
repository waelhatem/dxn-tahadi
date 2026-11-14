-- Encrypted membership key vault + registration completion screenshots.
-- The leader-only Vercel API validates session via bootstrap before using service_role.
-- Plaintext passwords, master secrets and unencrypted screenshots are never stored here.
create table if not exists public.membership_keys_vaults (
  vault_id text primary key,
  encrypted_envelope jsonb not null,
  revision bigint not null default 1 check (revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint membership_keys_vault_id_check check (vault_id = 'leader'),
  constraint membership_keys_vault_envelope_check check (
    jsonb_typeof(encrypted_envelope) = 'object'
    and encrypted_envelope->>'format' = 'mafatih-dxn'
    and encrypted_envelope->>'version' = '1'
    and encrypted_envelope->>'iterations' = '600000'
    and jsonb_typeof(encrypted_envelope->'salt') = 'string'
    and jsonb_typeof(encrypted_envelope->'iv') = 'string'
    and jsonb_typeof(encrypted_envelope->'data') = 'string'
  )
);
alter table public.membership_keys_vaults enable row level security;
revoke all on public.membership_keys_vaults from public, anon, authenticated;
grant select, insert, update on public.membership_keys_vaults to service_role;

create table if not exists public.membership_keys_images (
  member_id uuid primary key,
  encrypted_envelope jsonb not null,
  revision bigint not null default 1 check (revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint membership_keys_images_format_check check (
    jsonb_typeof(encrypted_envelope) = 'object'
    and encrypted_envelope->>'format' = 'mafatih-dxn'
    and encrypted_envelope->>'version' = '1'
    and encrypted_envelope->>'iterations' = '600000'
    and jsonb_typeof(encrypted_envelope->'salt') = 'string'
    and jsonb_typeof(encrypted_envelope->'iv') = 'string'
    and jsonb_typeof(encrypted_envelope->'data') = 'string'
  )
);
alter table public.membership_keys_images enable row level security;
revoke all on public.membership_keys_images from public, anon, authenticated;
grant select, insert, update, delete on public.membership_keys_images to service_role;
