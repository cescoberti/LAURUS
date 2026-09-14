-- LAURUS — the official voting lists, as published.
set search_path = laurus, public;

-- During a plenary week the EP publishes each file's Tabling Service voting
-- list on "Order and lists of votes" (plenary/en/votes.html) as a DOCX with a
-- version label — "initial", "REVISED VERSION", "FINAL VERSION". That list IS
-- the structure an advisor works on: LAURUS only fills its Remarks column.
--
-- Append-only: every distinct file (by sha256) is a new row, so a list can be
-- regenerated against any version the EP ever published and a change under
-- an unchanged label still shows up. The latest row per item is the current
-- list. The files are small (≈10 KB) and needed at request time, so the bytes
-- live here rather than in Storage.
create table if not exists voting_lists (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references items (id) on delete cascade,
  version_label text not null,            -- as printed on the votes page / in the file
  source_url    text not null,
  sha256        text not null,
  byte_size     integer not null,
  docx          bytea not null,
  etag          text,
  last_modified text,                     -- HTTP Last-Modified, verbatim
  fetched_at    timestamptz not null default now(),
  checked_at    timestamptz not null default now(),  -- last time the EP copy was compared
  unique (item_id, sha256)
);

create index if not exists voting_lists_item_idx on voting_lists (item_id, fetched_at desc);

alter table voting_lists enable row level security;
drop policy if exists "members read voting_lists" on voting_lists;
create policy "members read voting_lists" on voting_lists for select to authenticated using (true);
