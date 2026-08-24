-- Where a trial's data comes from, besides the app itself.
--
-- A soil probe's SensorThings endpoint, an ISOBUS export from a terminal, the
-- written protocol. Recorded rather than ingested: nothing reads or parses
-- these, and that is deliberate. Provenance is the first question anybody
-- reviewing a trial asks, and a number in the export had no way of saying
-- where it came from if it did not come from somebody's phone.
--
-- jsonb rather than a table of its own, matching how form fields and site
-- coordinates are already stored. A handful of references per trial does not
-- earn a table, its own sync path and its own row-level policies — and if
-- fetching is ever built, the shape can move then with something to move.
--
-- Defaults to an empty array so every existing trial reads back cleanly.
alter table trials
  add column if not exists data_sources jsonb not null default '[]'::jsonb;
