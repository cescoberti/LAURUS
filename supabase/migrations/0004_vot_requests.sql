-- Per-item vote-request data parsed from the official per-sitting VOT XML
-- (PV-10-YYYY-MM-DD-VOT_<lang>.xml): split-vote requests WITH the full text
-- of each part, separate-vote and roll-call requests, localised per language.
set search_path = laurus, public;

create table if not exists vot_requests (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references items (id) on delete cascade,
  language    text not null,
  source_url  text not null,
  payload     jsonb not null,   -- {splitVotes:[{group,subject,parts:[{section,text}]}], separateVotes:[...], rollCalls:[...]}
  fetched_at  timestamptz not null default now(),
  unique (item_id, language)
);
create index if not exists vot_requests_item_idx on vot_requests (item_id);

alter table vot_requests enable row level security;

drop policy if exists "auth read vot_requests" on vot_requests;
create policy "auth read vot_requests" on vot_requests for select to authenticated using (true);
