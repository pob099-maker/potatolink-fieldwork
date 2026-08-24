-- Plot layout for designed trials.
--
-- The layout itself is not stored: it is a pure function of the seed, the
-- treatments and the block count, so keeping the seed is enough to reproduce
-- it exactly. That is the point of seeding it in the first place — a layout
-- nobody can regenerate is one nobody can check.
--
-- "blocking" is kept separate from "design" because they answer different
-- questions. Replication gives you an estimate of variation; blocking decides
-- how plots are arranged so a known gradient — a slope, a drainage line — is
-- absorbed by the block instead of being read as a treatment effect.
--
-- Wrapped in a transaction so a half-run migration is impossible: without it,
-- a browser tab closed mid-run leaves trials with one of the two columns and
-- every push still refused, which is harder to diagnose than nothing at all.
begin;

alter table trials
  add column if not exists blocking text not null default 'none'
    check (blocking in ('none', 'blocks'));

alter table trials
  add column if not exists layout_seed text;

-- The plot a record was taken in. Nullable, because it only exists once a
-- trial has a layout — an observational trial, or one laid out on paper, has
-- no plot number to give. Where it is set it is the strongest key in the
-- table: it ties one row to one square of ground, which is what an analysis
-- needs and what "replicate 3 of the high-N treatment" only approximates.
alter table measurement_events
  add column if not exists plot integer;

commit;
