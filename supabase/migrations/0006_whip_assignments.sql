-- LAURUS — whip role, committee→advisor map, per-file assignment + note status.
set search_path = laurus, public;

-- ---------------------------------------------------------------------------
-- 'whip' role (oversees assignments) — between admin and member.
-- ---------------------------------------------------------------------------
alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check check (role in ('admin', 'whip', 'member'));

-- ---------------------------------------------------------------------------
-- committee → advisor (seeded from the ECR onboarding map in public.committees).
-- advisor is a name; it links to a LAURUS account once that advisor onboards.
-- ---------------------------------------------------------------------------
create table if not exists committee_advisors (
  code            text primary key,
  advisor         text,
  advisor_user_id uuid references users (id) on delete set null,
  updated_at      timestamptz not null default now()
);

insert into committee_advisors (code, advisor)
  select code, advisor from public.committees
  on conflict (code) do update set advisor = excluded.advisor, updated_at = now();

alter table committee_advisors enable row level security;
drop policy if exists "read committee_advisors" on committee_advisors;
create policy "read committee_advisors" on committee_advisors for select to authenticated using (true);
-- Writes go through the whip/admin server actions (service-role); no write policy.

-- ---------------------------------------------------------------------------
-- Per-item assignment override + plenary-note tracking.
-- effective advisor = assigned_advisor (override) ?? committee_advisors[committee]
-- ---------------------------------------------------------------------------
alter table items add column if not exists assigned_advisor  text;
alter table items add column if not exists note_status       text not null default 'pending'
  check (note_status in ('pending', 'submitted', 'na'));
alter table items add column if not exists note_submitted_at timestamptz;
