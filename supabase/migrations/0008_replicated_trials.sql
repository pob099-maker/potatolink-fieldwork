-- Opt-in support for replicated ("proper") trials.
--
-- A trial declares its design. "observational" (the default, and what every
-- existing trial is) behaves exactly as before — no reps, no completeness
-- checks. "replicated" turns on replicate structure, a target rep count, and a
-- designated response variable, so the trial can be analysed statistically.
-- Nothing here changes an observational trial.

alter table trials
  add column if not exists design text not null default 'observational'
    check (design in ('observational', 'replicated')),
  add column if not exists replicates integer not null default 0,
  add column if not exists response_metric text;

-- Which replicate/block a record belongs to; null for observational trials and
-- for records that aren't per-plot (weather, cost logs).
alter table measurement_events
  add column if not exists replicate integer;

create index if not exists measurement_events_arm_replicate
  on measurement_events (arm_id, replicate);
