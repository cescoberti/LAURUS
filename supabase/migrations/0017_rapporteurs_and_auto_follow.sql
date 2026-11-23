-- LAURUS — every rapporteur of a file, and the star that sets itself.
set search_path = laurus, public;

-- A joint-committee report has one rapporteur PER committee, and the
-- Parliament orders them: A10-0041/2026 (Omnibus IV) is ECON → VIVALDINI,
-- ENVI → HANSEN, LIBE → MANDL. `items.rapporteur` is a single text column and
-- kept as the joined display string ("A, B, C"); this table is the structure
-- behind it — who, for which committee, from which group, in which place of
-- the order (the API's precedenceOrder, which is also the order OEIL prints).
create table if not exists item_rapporteurs (
  item_id         uuid not null references items (id) on delete cascade,
  person_id       text not null,            -- 'person/257143', the persistent id
  name            text not null,            -- 'Mariateresa VIVALDINI', as personName writes it
  committee       text,                     -- 'ECON'; null when the participation names none
  political_group text,                     -- 'ECR', 'PPE', 'S-D' as the API writes them
  precedence      integer,                  -- ascending = the Parliament's order
  role            text not null default 'RAPPORTEUR' check (role in ('RAPPORTEUR', 'RAPPORTEUR_CO')),
  primary key (item_id, person_id)
);

create index if not exists item_rapporteurs_item_idx on item_rapporteurs (item_id, precedence);

alter table item_rapporteurs enable row level security;
drop policy if exists "members read item_rapporteurs" on item_rapporteurs;
create policy "members read item_rapporteurs" on item_rapporteurs for select to authenticated using (true);

-- The author line of an amendment, in its two halves. `tabled_by` keeps only
-- one of them (the group if the template names it, else the MEPs), so a file
-- tabled by "Nicolas Bay, Marion Maréchal … on behalf of the ECR Group" lost
-- its signatories. Both are filled the next time a file's amendments are
-- ingested; rows already there stay as they are until then.
alter table amendments add column if not exists tabled_members text[];
alter table amendments add column if not exists tabled_group   text;

-- A member can ask for a star on every file of some committees (ECON, BUDG,
-- CONT for a budget advisor) instead of starring them one by one.
alter table users add column if not exists auto_follow_committees text[] not null default '{}';

-- The register of stars put on automatically. A star is an ordinary
-- subscription the member can remove file by file; without this, the next
-- alert run would find the file starred-by-rule and unstarred-by-nobody and
-- put it back. One row = "this file was offered once, do not offer it again".
create table if not exists auto_follows (
  user_id    uuid not null references users (id) on delete cascade,
  item_id    uuid not null references items (id) on delete cascade,
  committee  text not null,                 -- the committee of the rule that fired
  created_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

alter table auto_follows enable row level security;
drop policy if exists "own auto_follows" on auto_follows;
create policy "own auto_follows" on auto_follows for select to authenticated using (user_id = auth.uid());

grant select on item_rapporteurs, auto_follows to authenticated;
grant all on item_rapporteurs, auto_follows to service_role;
