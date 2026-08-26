-- When observations are expected, and whether the crop has got there yet.
--
-- Trial protocols are written against the crop, not the calendar: "at tuber
-- initiation", "a fortnight after emergence", "at desiccation". A schedule
-- fixed to dates at setup is wrong the first time a season runs late, and
-- every week after that it is wronger.
--
-- So three columns, holding three different qualities of information:
--
--   sites.planting_date   the anchor. The one date on a trial that somebody
--                         always knows exactly. On the site rather than the
--                         trial because two sites planted a fortnight apart
--                         are two schedules — the same reason each site is
--                         randomised separately.
--
--   sites.stage_dates     growth stage id -> the date it actually arrived
--                         here. This is what stops the schedule decaying. An
--                         estimated window comes from the planting date plus
--                         a typical day count; a confirmed date replaces the
--                         estimate and everything hung off that stage
--                         re-anchors to it.
--
--   form_templates.timing which stage a form hangs off and the day offsets
--                         around it. Kept alongside the existing free-text
--                         `frequency` rather than replacing it: frequency is
--                         the sentence a person reads, this is the structured
--                         half the app computes from. Replacing it would have
--                         broken every template already written and the CSV
--                         importer with them.
--
-- planting_date is a date, not a timestamptz, on purpose. It is a day somebody
-- remembers rather than an instant, and a timezone is all it takes to shift it
-- across midnight and move every window that hangs off it by a day.
--
-- All three default, so every existing row reads back cleanly and every
-- existing form keeps behaving exactly as it does now: unscheduled, which is
-- the honest description of a form with no timing set.

alter table sites
  add column if not exists planting_date date,
  add column if not exists stage_dates jsonb not null default '{}'::jsonb;

alter table form_templates
  add column if not exists timing jsonb;

-- The due list asks "which sites in this trial have a planting date" on every
-- dashboard load. Small tables today, but the query runs on the busiest screen.
create index if not exists sites_trial_planting_idx
  on sites (trial_id)
  where planting_date is not null;

comment on column sites.planting_date is
  'Anchor date for observation timing. Null means this site is not scheduled.';
comment on column sites.stage_dates is
  'Growth stage id -> confirmed arrival date at this site. Overrides estimates.';
comment on column form_templates.timing is
  'Structured schedule: { stage, dapFrom, dapTo }. Null means fill in whenever.';
