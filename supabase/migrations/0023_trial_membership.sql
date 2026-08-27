-- Who is involved in a trial.
--
-- The app has never been able to answer this about a person, only about a
-- record. A farmer today is anonymous: they tap a link carrying a code that is
-- the same for everybody and sits in the compiled bundle, so nothing can be
-- shown or hidden per person because there is no person to key on. Every entry
-- is filed against whichever grower contact happened to be first in the list.
--
-- Two things are needed, and only one of them is new.
--
-- Most involvement is already recorded and simply never read: sites.contact_id
-- names the grower whose paddock a site is in. A farmer is involved in a trial
-- if one of its sites is theirs, and that is true of every trial in the system
-- right now without a single new row.
--
-- What cannot be derived is everybody else — a co-operating agronomist, a
-- project officer, a second grower helping on somebody else's site, a
-- researcher who reads results and never records anything. That is what
-- trial_members holds. It is deliberately the smaller half.
--
-- The bridge to real accounts is contacts.auth_user_id, and it is the reason
-- to do this now rather than later. Involvement is recorded against a contact,
-- which is a person the programme already knows about; linking that contact to
-- a sign-in is one column, set once, whenever that person gets an account.
-- Nothing here has to be rewritten to close reads later, which is the whole
-- point of doing the modelling before several teams start entering data.
-- Retrofitting ownership onto rows that already exist is the harder version of
-- this job (see docs/GO-LIVE.md).
--
-- Reads stay open in this migration. It records who is involved; it does not
-- yet enforce anything, and the policies that would are written separately so
-- that turning them on is a decision rather than a side effect.
--
-- Nothing is dropped anywhere in this file, on purpose: a migration whose only
-- drops target its own new policies still reads as destructive and stops
-- somebody mid-run for no reason.

-- The link between a person the programme knows about and an account they can
-- sign in with. Null for almost everybody, and that is the normal state: a
-- grower who records through a link has no account and does not need one.
alter table contacts add column if not exists auth_user_id uuid;

-- One account is one person. Without this, two contacts could claim the same
-- sign-in and "which trials am I on" would have two different answers.
create unique index if not exists contacts_auth_user_unique
  on contacts (auth_user_id) where auth_user_id is not null;

create table if not exists trial_members (
  member_id uuid primary key,
  trial_id uuid not null references trials (trial_id),
  contact_id uuid not null references contacts (contact_id),
  -- What this person does on this trial, which is not the same as what they
  -- are in general: the contact role says a person is an agronomist, this says
  -- they are the one who reads the results on this particular trial.
  --
  -- "owner" is whoever answers for the trial; "collaborator" takes part;
  -- "viewer" reads and records nothing. Deliberately three: a list long enough
  -- to argue about is a list nobody sets correctly.
  role text not null default 'collaborator'
    check (role in ('owner', 'collaborator', 'viewer')),
  created_at timestamptz not null default now()
);

-- A person is on a trial once. Adding them again should be a no-op, not a
-- second row that makes them disappear from a list keyed on the pair.
create unique index if not exists trial_members_unique
  on trial_members (trial_id, contact_id);

create index if not exists trial_members_contact_idx on trial_members (contact_id);
create index if not exists trial_members_trial_idx on trial_members (trial_id);

alter table trial_members enable row level security;

do $$
begin
  begin
    execute 'create policy anon_read on trial_members for select to anon using (true)';
  exception when duplicate_object then null;
  end;
  begin
    execute 'create policy anon_insert on trial_members for insert to anon with check (true)';
  exception when duplicate_object then null;
  end;
  begin
    execute 'create policy anon_update on trial_members for update to anon using (true) with check (true)';
  exception when duplicate_object then null;
  end;
  begin
    execute 'create policy anon_delete on trial_members for delete to anon using (true)';
  exception when duplicate_object then null;
  end;
end;
$$;

comment on table trial_members is
  'Involvement that cannot be derived from site ownership. A farmer whose paddock holds a site is already involved without a row here.';
comment on column trial_members.role is
  'What this person does on this trial, as opposed to what they are in general.';
comment on column contacts.auth_user_id is
  'The account this person signs in with, once they have one. Null for everybody who records through a link.';
