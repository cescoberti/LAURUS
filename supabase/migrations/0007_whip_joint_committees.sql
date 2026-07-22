-- LAURUS — whip: support joint-committee files (one advisor per committee).
set search_path = laurus, public;

-- A file can be referred to several committees (e.g. SEDE/IMCO). Keep the single
-- `committee` column as the lead (committees[1]) for existing code; the full,
-- ordered list drives the per-committee advisor boxes on the whip board.
alter table items add column if not exists committees text[];

-- Per-committee advisor override: { "EMPL": "…", "SANT": "…" }. The single
-- `assigned_advisor` column stays for the lead committee's back-compat, but the
-- board now reads/writes this map. Effective advisor for committee C =
-- assigned_advisors[C] ?? committee_advisors[C].
alter table items add column if not exists assigned_advisors jsonb not null default '{}'::jsonb;

-- Backfill the list from the existing single committee so pre-existing rows keep
-- exactly one box.
update items set committees = array[committee] where committees is null and committee is not null;

-- Carry any existing single override into the new map under the lead committee.
update items
  set assigned_advisors = jsonb_build_object(committee, assigned_advisor)
  where assigned_advisor is not null and committee is not null and assigned_advisors = '{}'::jsonb;
