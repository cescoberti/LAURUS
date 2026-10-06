-- How many amendments of a file exist in each language.
--
-- The EP publishes a file's amendments in the original language first and
-- translates block by block over the following hours; the Remarks column of a
-- voting list can only be filled in a language once that language is out. The
-- alert loop fingerprints a file by its amendment COUNT, which does not move
-- when a translation lands (the numbers are already there in English) — so an
-- advisor waiting for Italian was never told it had arrived. This view is the
-- missing dimension.
set search_path = laurus, public;

create or replace view amendment_language_counts as
  select item_id, language, count(distinct number)::integer as n
    from amendments
   group by item_id, language;

comment on view amendment_language_counts is
  'Distinct amendment numbers per (file, language) — how far translation has got, for the alert fingerprint.';

-- The view runs as its caller, so `amendments` RLS still decides what is
-- visible through it.
alter view amendment_language_counts set (security_invoker = on);

grant select on amendment_language_counts to authenticated, service_role;
