-- LAURUS — EP Plenary Companion
-- Initial schema. Aligned with the EP Open Data API v2 ELI/FRBR model.
-- All tables have RLS enabled; policies are added at the end.
--
-- This project's Supabase instance is shared with ecr-onboarding (its
-- tables live in `public`). Everything below is created in its own
-- `laurus` schema instead, so the two apps stay visually and namespace
-- separated in the Table Editor and never collide on table names.

create extension if not exists "pgcrypto";

create schema if not exists laurus;
set search_path = laurus, public;

-- Unlike `public`, a freshly created schema grants no privileges to the
-- API roles by default — the Data API's "exposed schema" toggle alone
-- isn't enough. RLS policies (below) still gate actual row access.
grant usage on schema laurus to anon, authenticated, service_role;
alter default privileges in schema laurus grant all on tables to anon, authenticated, service_role;
alter default privileges in schema laurus grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema laurus grant all on routines to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type session_location as enum ('BXL', 'STR');            -- Brussels / Strasbourg
create type vl_status        as enum ('none', 'draft', 'final');
create type document_type    as enum ('report', 'amendment', 'voting_list', 'split', 'rcv');
create type amendment_kind   as enum ('standard', 'oral', 'compromise_cam', 'withdrawn');
create type vote_type        as enum ('am', 'split', 'separate', 'rcv', 'final_vote');
create type remarks_status   as enum ('empty', 'auto', 'manual', 'anomaly');
create type subscription_scope as enum ('session', 'committee', 'item');
create type ingestion_status as enum ('running', 'ok', 'error');

-- ---------------------------------------------------------------------------
-- users  (mirror of auth.users, group-advisor profile)
-- ---------------------------------------------------------------------------
create table users (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null unique,
  full_name   text,
  role        text not null default 'member' check (role in ('admin', 'member')),
  ep_group    text,                     -- political group code, e.g. 'ECR', 'EPP'
  created_at  timestamptz not null default now()
);

-- Only the service-role (admin invite flow) may set or change role; a user
-- updating their own profile row cannot self-promote.
create function prevent_role_change() returns trigger as $$
begin
  if auth.role() <> 'service_role' and new.role is distinct from old.role then
    new.role := old.role;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = laurus, public;

create trigger users_prevent_role_change
  before update on users
  for each row execute function prevent_role_change();

-- ---------------------------------------------------------------------------
-- sessions  (plenary part-session)
-- ---------------------------------------------------------------------------
create table sessions (
  id             uuid primary key default gen_random_uuid(),
  ep_meeting_id  text unique,           -- API activity_id, e.g. 'MTG-PL-2026-06-17'
  month_label    text,                  -- 'Jun', 'Mar II'
  start_date     date not null,
  end_date       date not null,
  location       session_location not null,
  vote_count     integer not null default 0,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- items  (agenda point put to the vote)
-- ---------------------------------------------------------------------------
create table items (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references sessions (id) on delete cascade,
  code              text not null,          -- 'A10-0136/2026' or 'OTH-...'
  ep_work_id        text,                   -- ELI work id, e.g. 'eli/dl/doc/A-10-2026-0136'
  title             jsonb not null default '{}'::jsonb,  -- {en: '...', it: '...'} per language
  rapporteur        text,
  committee         text,                   -- committee code, e.g. 'AGRI'
  procedure_ref     text,                   -- '2025/0097(COD)'
  vote_date         date,
  am_deadline       timestamptz,
  split_deadline    timestamptz,
  am_count          integer not null default 0,
  vl_status         vl_status not null default 'none',
  assigned_staff_id uuid references users (id) on delete set null,
  created_at        timestamptz not null default now(),
  unique (session_id, code)
);
create index items_session_idx   on items (session_id);
create index items_committee_idx on items (committee);

-- ---------------------------------------------------------------------------
-- documents  (every file version fetched; one row per lang+version)
-- ---------------------------------------------------------------------------
create table documents (
  id                 uuid primary key default gen_random_uuid(),
  item_id            uuid not null references items (id) on delete cascade,
  type               document_type not null,
  language           text not null,          -- ISO 639-1, 24 EU languages
  version            integer not null default 1,
  source_url         text not null,
  ep_manifestation_id text,                  -- ELI manifestation id from the API
  storage_path       text,                   -- Supabase Storage path of the archived file
  sha256             text,
  byte_size          bigint,
  published_at       timestamptz,            -- API 'issued'
  fetched_at         timestamptz not null default now(),
  unique (item_id, type, language, version)
);
create index documents_item_idx on documents (item_id);

-- ---------------------------------------------------------------------------
-- amendments  (normalised, two-column parse)
-- ---------------------------------------------------------------------------
create table amendments (
  id                 uuid primary key default gen_random_uuid(),
  item_id            uuid not null references items (id) on delete cascade,
  number             integer not null,
  tabled_by          text,                   -- group / MEPs
  target             text,                   -- 'Recital C', 'Article 4', '§ 15'
  original_text      text,
  amended_text       text,
  language           text not null,
  kind               amendment_kind not null default 'standard',
  source_document_id uuid references documents (id) on delete set null,
  raw_html           text,
  created_at         timestamptz not null default now(),
  unique (item_id, number, language)
);
create index amendments_item_idx on amendments (item_id);

-- ---------------------------------------------------------------------------
-- voting_list_rows  (one row of a voting list; Remarks target of Feature 4)
-- ---------------------------------------------------------------------------
create table voting_list_rows (
  id                      uuid primary key default gen_random_uuid(),
  voting_list_document_id uuid not null references documents (id) on delete cascade,
  order_index             integer not null,
  subject                 text,               -- 'Am 72', '§ 15', 'Considerando C'
  amendment_number        integer,            -- nullable
  author                  text,
  vote_type               vote_type not null,
  split_parts             jsonb not null default '[]'::jsonb,
  remarks                 text default '',
  remarks_status          remarks_status not null default 'empty',
  matched_amendment_id    uuid references amendments (id) on delete set null,
  unique (voting_list_document_id, order_index)
);
create index vlr_document_idx on voting_list_rows (voting_list_document_id);

-- ---------------------------------------------------------------------------
-- subscriptions  (user -> session|committee|item, per channel)
-- ---------------------------------------------------------------------------
create table subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users (id) on delete cascade,
  scope       subscription_scope not null,
  target_id   text not null,           -- session id / committee code / item id
  channel     text not null default 'email',
  created_at  timestamptz not null default now(),
  unique (user_id, scope, target_id, channel)
);
create index subscriptions_user_idx on subscriptions (user_id);

-- ---------------------------------------------------------------------------
-- notifications  (idempotent send log)
-- ---------------------------------------------------------------------------
create table notifications (
  id              uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references subscriptions (id) on delete cascade,
  document_id     uuid not null references documents (id) on delete cascade,
  version         integer not null,
  sent_at         timestamptz not null default now(),
  unique (subscription_id, document_id, version)   -- no double email if cron re-runs
);

-- ---------------------------------------------------------------------------
-- ingestion_runs  (audit of each polling run)
-- ---------------------------------------------------------------------------
create table ingestion_runs (
  id           uuid primary key default gen_random_uuid(),
  source       text not null,          -- 'ep-api:meetings', 'doceo:voting-list', ...
  status       ingestion_status not null default 'running',
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  found        jsonb not null default '{}'::jsonb,
  changed      jsonb not null default '{}'::jsonb,
  error        text
);
create index ingestion_runs_started_idx on ingestion_runs (started_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table users            enable row level security;
alter table sessions         enable row level security;
alter table items            enable row level security;
alter table documents        enable row level security;
alter table amendments       enable row level security;
alter table voting_list_rows enable row level security;
alter table subscriptions    enable row level security;
alter table notifications    enable row level security;
alter table ingestion_runs   enable row level security;

-- Reference/plenary data is readable by any authenticated advisor.
create policy "auth read sessions"   on sessions         for select to authenticated using (true);
create policy "auth read items"      on items            for select to authenticated using (true);
create policy "auth read documents"  on documents        for select to authenticated using (true);
create policy "auth read amendments" on amendments       for select to authenticated using (true);
create policy "auth read vlr"        on voting_list_rows for select to authenticated using (true);

-- A user sees and edits only their own profile. Row creation on invite goes
-- through the service-role admin client (see app/admin/users/actions.ts),
-- so the self-insert path here is only a fallback and can never grant admin.
create policy "own profile read"   on users for select to authenticated using (id = auth.uid());
create policy "own profile upsert" on users for insert to authenticated
  with check (id = auth.uid() and role = 'member');
create policy "own profile update" on users for update to authenticated using (id = auth.uid());

-- A user manages only their own subscriptions / notifications.
create policy "own subs"   on subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own notifs" on notifications for select to authenticated
  using (exists (select 1 from subscriptions s where s.id = subscription_id and s.user_id = auth.uid()));

-- Writes to plenary data and ingestion audit happen only through the
-- service-role key (server-side ingestion), which bypasses RLS. No
-- authenticated-role write policies are defined for those tables on purpose.

-- One-time manual step after running this script: Project Settings > API >
-- "Exposed schemas" must include `laurus`, or PostgREST (and this app's
-- Supabase client, configured with db.schema = "laurus") won't see these
-- tables. `public` stays exposed too, for ecr-onboarding.
