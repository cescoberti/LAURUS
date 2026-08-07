-- LAURUS — whip reminders: one row per reminder actually sent.
set search_path = laurus, public;

-- Advisors are reminded twice before a sitting: three weeks out (heads-up) and
-- two weeks out (the plenary note is due). The row is the send receipt — the
-- unique key is what stops a second email when the daily cron runs again, or
-- when the whip also presses "send due reminders now".
create table if not exists whip_reminders (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references sessions (id) on delete cascade,
  advisor       text not null,
  advisor_email text,
  -- T21 = three weeks before the sitting, T14 = two weeks (note due)
  stage         text not null check (stage in ('T21', 'T14')),
  item_codes    text[] not null default '{}',
  sent_at       timestamptz not null default now(),
  unique (session_id, advisor, stage)
);

create index if not exists whip_reminders_session_idx on whip_reminders (session_id);

alter table whip_reminders enable row level security;

-- Whips and admins can see what went out; sending is service-role only.
drop policy if exists "read whip_reminders" on whip_reminders;
create policy "read whip_reminders" on whip_reminders
  for select to authenticated
  using (exists (select 1 from users u where u.id = auth.uid() and u.role in ('whip', 'admin')));
