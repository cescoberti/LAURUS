-- The Remarks column quotes the amendment as the EP prints it: the two
-- columns one under the other, each under its own heading, with the words
-- the amendment touches in bold.
--
-- That needs two things the ingestion was throwing away. The runs: the
-- template marks every change in bold italic, and `original_text` /
-- `amended_text` are plain, so the emphasis had to be re-derived. And the
-- headings: whether the left column is called "Proposta di risoluzione",
-- "Testo della Commissione" or "Posizione del Consiglio" is a fact about the
-- file, in the file's own language — nothing LAURUS can work out, and
-- nothing it may invent.
--
-- Both are filled by the next ingestion of a block. A row that predates this
-- migration keeps working: the quote falls back to the plain text, with the
-- bold derived from the word diff.
set search_path = laurus, public;

alter table amendments add column if not exists original_rich   text;
alter table amendments add column if not exists amended_rich    text;
alter table amendments add column if not exists original_header text;
alter table amendments add column if not exists amended_header  text;

-- How a member wants the Remarks written. 'columns' is the EP's own two
-- columns, copied; 'diff' is the merged text LAURUS used to build, where what
-- the amendment removes is struck through and what it adds is bold.
alter table users add column if not exists vl_remarks_style text not null default 'columns'
  check (vl_remarks_style in ('columns', 'diff'));
