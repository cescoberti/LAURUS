-- LAURUS — per-file alerts for followed reports.
set search_path = laurus, public;

-- A member follows a file (subscriptions, scope='item') and is told when its
-- voting-list material changes: new amendment blocks, or the split/separate
-- requests arriving. This is the send receipt: `fingerprint` is the state of
-- the file that was announced (amendment count + which VOT languages exist),
-- so the same state is never announced twice, however often the live loop
-- asks. A new fingerprint = something actually changed = one more message.
create table if not exists vl_alerts (
  id              uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references subscriptions (id) on delete cascade,
  item_id         uuid not null references items (id) on delete cascade,
  fingerprint     text not null,
  channel         text not null,
  sent_at         timestamptz not null default now(),
  unique (subscription_id, item_id, fingerprint)
);

create index if not exists vl_alerts_item_idx on vl_alerts (item_id);

alter table vl_alerts enable row level security;
drop policy if exists "own vl_alerts" on vl_alerts;
create policy "own vl_alerts" on vl_alerts for select to authenticated
  using (exists (select 1 from subscriptions s where s.id = subscription_id and s.user_id = auth.uid()));
