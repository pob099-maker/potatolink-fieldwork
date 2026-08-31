-- Somebody with the link, asking to be let in.
--
-- Once sign-ups are closed, a person who has the URL and types their email at
-- the sign-in screen is simply refused. There is no route forward and nothing
-- tells anybody they tried — so the only way in is to already know somebody,
-- and the person holding the app never learns that anyone wanted access.
--
-- This is that route. It is deliberately not a sign-up: no account is created,
-- nothing is granted, and approving one is still a deliberate act performed by
-- hand in the Supabase dashboard. What it does is turn a dead end into a
-- request that somebody can see and answer.
--
-- The policies are the point of this file, and they are not symmetrical.
--
--   anon may INSERT and nothing else. Anyone with the link can ask.
--   anon may NOT SELECT. A request carries somebody's name, email and their
--     reason for wanting in — a small pile of contact details that would
--     otherwise be readable by anyone who found the table, which is worse than
--     the problem this solves.
--   authenticated may SELECT and UPDATE, so signed-in staff can read the queue
--     and mark a request handled.
--
-- Nothing is dropped in this file, so it should not trip the destructive
-- operation warning.

create table if not exists access_requests (
  request_id uuid primary key,
  name text not null,
  email text not null,
  -- Why they want in, in their words. Optional, and the most useful column
  -- when deciding: "I am the agronomist at Walkers Flat" answers the question
  -- that an email address on its own cannot.
  reason text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'declined')),
  -- What was decided and by whom, so a queue that has been worked through
  -- still says what happened.
  handled_note text not null default '',
  requested_at timestamptz not null default now(),
  handled_at timestamptz
);

-- Asking twice is the same request, not two.
--
-- Partial on pending so that somebody declined last season, or approved and
-- since removed, can ask again — without it a single past decision would lock
-- a person out permanently with no way to say so.
create unique index if not exists access_requests_pending_email
  on access_requests (lower(email)) where status = 'pending';

create index if not exists access_requests_status_idx
  on access_requests (status, requested_at desc);

alter table access_requests enable row level security;

do $$
begin
  -- Insert only for anon. No select: see the note above.
  begin
    execute 'create policy anon_request on access_requests for insert to anon with check (true)';
  exception when duplicate_object then null;
  end;
  begin
    execute 'create policy staff_read on access_requests for select to authenticated using (true)';
  exception when duplicate_object then null;
  end;
  begin
    execute 'create policy staff_update on access_requests for update to authenticated using (true) with check (true)';
  exception when duplicate_object then null;
  end;
end;
$$;

comment on table access_requests is
  'People with the link asking to be let in. Not a sign-up: approving one is still a deliberate act in the dashboard.';
comment on column access_requests.reason is
  'Why they want access, in their words — usually the column that actually answers the question.';
