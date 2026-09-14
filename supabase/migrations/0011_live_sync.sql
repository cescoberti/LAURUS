-- LAURUS — live sync during plenary weeks.
set search_path = laurus, public;

-- Which amendment blocks (per language) have been read already. The live loop
-- runs every five minutes during a part-session and must only download what
-- is new: a late block on a report that was already ingested is exactly the
-- case the per-item skip in sync-amendments would miss.
create table if not exists ingested_blocks (
  identifier  text not null,          -- 'A-10-2026-0201-AM-006-010'
  language    text not null,
  item_id     uuid references items (id) on delete cascade,
  amendments  integer not null default 0,
  ingested_at timestamptz not null default now(),
  primary key (identifier, language)
);

alter table ingested_blocks enable row level security;
-- Server-side bookkeeping only (service role); no client policies.
