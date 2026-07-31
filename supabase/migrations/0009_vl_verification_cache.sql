-- LAURUS — make verification fast without making it weaker.
set search_path = laurus, public;

-- Locating a report's amendment blocks means paging the year's AMENDMENT_LIST
-- documents — the same few hundred identifiers every time. Cache the index per
-- year and filter it in memory; refreshed when stale.
create table if not exists ep_doc_index (
  year        integer not null,
  work_type   text    not null,
  identifiers text[]  not null default '{}',
  fetched_at  timestamptz not null default now(),
  primary key (year, work_type)
);

-- A verification result, keyed by the exact list it verified. `fingerprint` is
-- a hash of the list's rows: if the rebuilt list is byte-identical AND the
-- official sources for that report are final (the vote has happened), the
-- previous two-pass result still holds and is reused instead of re-downloading.
-- Anything else re-runs both passes.
create table if not exists vl_verifications (
  item_code   text not null,
  language    text not null,
  fingerprint text not null,
  report      jsonb not null,
  verified_at timestamptz not null default now(),
  primary key (item_code, language)
);

alter table ep_doc_index     enable row level security;
alter table vl_verifications enable row level security;
-- Both are server-side caches: written and read through the service-role
-- routes only, so no policies are granted to authenticated clients.
