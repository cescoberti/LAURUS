-- Motions for a resolution come in families: on one debate each group tables
-- its own motion (B10-0424 PPE, 0427 Renew, 0428 ECR, 0429 ESN, 0430 PFE on
-- the same subject), and the amendments are tabled against ONE of them —
-- usually not the one the agenda lists. What the family shares is the
-- SUBJECT, so the key is the normalised title.
--
-- Not `based_on`: that is the Rule the motion is tabled under (Rule 136, 150,
-- 115), which would lump every wind-up debate of the week into one family.
set search_path = laurus, public;

alter table items add column if not exists family_key text;
create index if not exists items_family_key_idx on items (session_id, family_key);

comment on column items.family_key is
  'Normalised subject title: ties the motions of one debate together so amendments tabled on a sibling motion reach the item on the agenda.';
