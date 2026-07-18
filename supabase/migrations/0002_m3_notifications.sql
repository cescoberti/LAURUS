-- LAURUS M3 — service accounts: notification preferences + usage tracking.
-- Run in the Supabase SQL editor (like 0001). Idempotent where possible.

set search_path = laurus, public;

-- ---------------------------------------------------------------------------
-- User notification preferences
-- ---------------------------------------------------------------------------
alter table users add column if not exists whatsapp_phone     text;
alter table users add column if not exists wants_clean_final  boolean not null default false;
alter table users add column if not exists wants_email        boolean not null default true;
alter table users add column if not exists wants_whatsapp     boolean not null default false;

-- ---------------------------------------------------------------------------
-- events — usage tracking (admin-only tracker)
-- ---------------------------------------------------------------------------
create table if not exists events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references users (id) on delete set null,
  type        text not null,            -- 'vl_download', 'vl_generate', 'wa_message', ...
  item_code   text,                     -- 'A10-0002/2026' when the event targets an item
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists events_created_idx on events (created_at desc);
create index if not exists events_item_idx    on events (item_code);

alter table events enable row level security;

-- Authenticated users may log their own events; only admins read them.
drop policy if exists "own events insert" on events;
create policy "own events insert" on events for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "admin events read" on events;
create policy "admin events read" on events for select to authenticated
  using (exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin'));
