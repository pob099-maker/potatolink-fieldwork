-- Let a practice arm be retired without losing its data.
--
-- A practice that didn't pan out should stop being offered for new entries
-- while its collected records and economics stay intact. Archiving does that;
-- an arm with no data at all can just be deleted outright in the app instead.

alter table practice_arms
  add column if not exists archived boolean not null default false;

create index if not exists practice_arms_trial_archived
  on practice_arms (trial_id, archived);
