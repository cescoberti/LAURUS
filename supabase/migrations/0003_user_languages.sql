-- Per-user working languages: the annotated VLs (and amendment ingestion)
-- are prepared only in the languages members actually selected. Default IT+EN.
set search_path = laurus, public;

alter table users add column if not exists languages text[] not null default '{it,en}';
