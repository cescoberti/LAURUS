-- Inbox: email arriving at laurus.the361.eu (documents to inbox@, people to
-- hello@) lands here as a queue the admin works through. Attachments live in
-- the private storage bucket "inbox" under <resend_email_id>/<filename>.
set search_path = laurus, public;

create table if not exists inbox_messages (
  id              uuid primary key default gen_random_uuid(),
  resend_email_id text not null unique,
  message_id      text,
  from_email      text not null,
  from_name       text,
  to_email        text not null,
  subject         text,
  received_at     timestamptz not null,
  text_body       text,
  html_body       text,
  -- [{id, filename, content_type, size, storage_path}]
  attachments     jsonb not null default '[]'::jsonb,
  -- document | request | other (routing by recipient, refined by triage)
  kind            text not null default 'other' check (kind in ('document', 'request', 'other')),
  -- what Claude understood of the email (summary, language, extracted fields)
  analysis        jsonb,
  -- the one thing to do about it, ready for approval
  proposed_action jsonb,
  status          text not null default 'new' check (status in ('new', 'handled', 'ignored')),
  handled_at      timestamptz,
  handled_by      uuid references users(id),
  note            text,
  created_at      timestamptz not null default now()
);

create index if not exists inbox_messages_status_idx on inbox_messages (status, received_at desc);

alter table inbox_messages enable row level security;
create policy "admin manage inbox" on inbox_messages for all to authenticated
  using (exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin'))
  with check (exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin'));

-- An invite can carry what the person told us by email, so onboarding opens
-- with committees and language already set.
alter table invites add column if not exists prefill jsonb;

-- Private bucket for the attachments (service role only).
insert into storage.buckets (id, name, public)
values ('inbox', 'inbox', false)
on conflict (id) do nothing;
