-- LAURUS — admin invite links, onboarding preferences, fair-use tracking.
-- Rate limiting and the usage panel reuse laurus.events (M3): each served VL
-- is already logged there as 'vl_download'/'vl_generate'. No token/cost
-- columns exist on purpose — VL generation is deterministic (no LLM, ~0 cost).
set search_path = laurus, public;

-- ---------------------------------------------------------------------------
-- Onboarding preferences on the user profile
-- ---------------------------------------------------------------------------
alter table users add column if not exists committees   text[] not null default '{}';
alter table users add column if not exists vl_language   text;
alter table users add column if not exists onboarded_at  timestamptz;

-- Existing users (the admin) are considered already onboarded, so the
-- mandatory-onboarding redirect never traps them.
update users set onboarded_at = coalesce(onboarded_at, now()) where role = 'admin';

-- ---------------------------------------------------------------------------
-- invites — admin-generated onboarding links
-- ---------------------------------------------------------------------------
create table if not exists invites (
  id          uuid primary key default gen_random_uuid(),
  token       uuid not null unique default gen_random_uuid(),
  email       text,                    -- optional: pre-fill / restrict
  created_by  uuid references users (id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '30 days',
  used_at     timestamptz,
  used_by     uuid references users (id) on delete set null
);
create index if not exists invites_token_idx on invites (token);

alter table invites enable row level security;

-- Only admins read/manage invites through the app; the public onboarding page
-- validates a token via the service-role client (bypasses RLS), never exposing
-- the list. No anon policy here on purpose.
drop policy if exists "admin manage invites" on invites;
create policy "admin manage invites" on invites for all to authenticated
  using (exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin'))
  with check (exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin'));
