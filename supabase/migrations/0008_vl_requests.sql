-- LAURUS — verified voting-list requests: queue, verification report, delivery.
set search_path = laurus, public;

-- A voting list is an operational document, so the verified route never returns
-- bytes straight to the browser: the list is built, put through both
-- verification passes, and emailed with its report. One row per request.
create table if not exists vl_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users (id) on delete cascade,
  item_code    text not null,
  language     text not null default 'it',
  -- pending  : queued, not processed yet
  -- verified : both passes ran, everything checked out; emailed
  -- issues   : generated and emailed, but the report lists problems
  -- failed   : could not be generated at all
  status       text not null default 'pending'
                 check (status in ('pending', 'running', 'verified', 'issues', 'failed')),
  report       jsonb,
  error        text,
  emailed_to   text,
  created_at   timestamptz not null default now(),
  started_at   timestamptz,
  finished_at  timestamptz
);

create index if not exists vl_requests_user_idx   on vl_requests (user_id, created_at desc);
create index if not exists vl_requests_status_idx on vl_requests (status, created_at);

alter table vl_requests enable row level security;

-- Members see their own requests; writes go through the server route
-- (service-role) so status and report can never be forged from the client.
drop policy if exists "read own vl_requests" on vl_requests;
create policy "read own vl_requests" on vl_requests
  for select to authenticated using (user_id = auth.uid());
