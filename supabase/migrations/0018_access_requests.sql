-- Access requests: someone asks to join LAURUS, the admin approves or refuses.
-- LAURUS stays invite-only; this is the door for the person who has no invite
-- yet. Approving a request makes an invite for that address (the same one the
-- admin could have made by hand) and emails the link, so the person lands in
-- LAURUS, never in the hosting provider.
set search_path = laurus, public;

create table if not exists access_requests (
  id           uuid primary key default gen_random_uuid(),
  -- Capability for the one-tap page in the admin's email (/richiesta/<token>).
  -- Not guessable; it lets whoever holds it decide this one request, nothing else.
  token        uuid not null unique default gen_random_uuid(),
  email        text not null,
  full_name    text,
  note         text,
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  invite_token uuid,                       -- the invite made when approved
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,
  decided_by   uuid references users (id) on delete set null,
  decided_via  text check (decided_via in ('panel', 'email'))
);

create index if not exists access_requests_status_idx on access_requests (status, created_at desc);
create index if not exists access_requests_email_idx on access_requests (lower(email));

alter table access_requests enable row level security;

-- Requests come in through the service role (the form is public) and are read
-- and decided by admins; no other policy on purpose.
drop policy if exists "admin manage access_requests" on access_requests;
create policy "admin manage access_requests" on access_requests for all to authenticated
  using (exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin'))
  with check (exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin'));
