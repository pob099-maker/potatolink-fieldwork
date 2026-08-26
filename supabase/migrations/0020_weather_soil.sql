-- Weather and soil as normalised datasets, not trial notes.
--
-- The app already records *where* data came from — a datastream, a machinery
-- export, a written protocol — and carries that through to the export. That is
-- a relationship layer: it says a number is traceable. It does not make the
-- number queryable, and a link alone cannot answer "rainfall between emergence
-- and tuber initiation" or "pH at 0–10 cm across every trial on this soil".
--
-- So the values get typed columns. Three tables rather than one generic
-- variable store, because weather and soil are different shapes and forcing
-- them together makes every query about either one a special case:
--
--   weather is a TIME SERIES belonging to a station
--   soil is a LAYERED PROFILE belonging to a point in the ground
--
-- Two decisions worth stating, because both look like mistakes otherwise.

-- 1. Weather belongs to the station, not to the trial.
--
-- There is no trial_id here. Observations are keyed by station and instant,
-- and sites point at a station — so two trials in the same district share one
-- set of rows instead of storing the same rainfall twice, and the source can
-- be swapped for SILO or an on-farm logger later without touching any trial.
--
-- 2. The rainfall column is not called rainfall_mm.
--
-- BOM's `rain_trace` is cumulative since 9am local. A column called
-- rainfall_mm invites summing it, which multiplies a day's rain by the number
-- of observations in the day. The name carries the warning because the column
-- comment will not be read by whoever writes the first SUM().

create table if not exists weather_observations (
  observation_id uuid primary key,
  source_system text not null default 'bom',
  station_id text not null,
  station_name text not null default '',
  lat double precision,
  lon double precision,
  -- timestamptz, never a bare timestamp: an observation is an instant, and
  -- half this country changes offset twice a year.
  observation_time timestamptz not null,
  air_temp_c double precision,
  rainfall_since_9am_mm double precision,
  relative_humidity_pct double precision,
  wind_speed_kmh double precision,
  -- Compass point as published ("SSE"), not degrees. BOM gives letters.
  wind_dir text,
  dew_point_c double precision,
  pressure_msl_hpa double precision,
  -- The source row verbatim, so a number in a report can be traced to what
  -- actually arrived — including the fields this schema does not model.
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  -- One reading per station per instant. A feed re-imported after a refresh
  -- updates rather than duplicating.
  unique (station_id, observation_time)
);

create index if not exists weather_station_time_idx
  on weather_observations (station_id, observation_time desc);

-- Which station describes a site's weather. A link, not a copy.
alter table sites
  add column if not exists bom_station_id text;

-- Soil: a sample is a place, a day and a slice of the profile.
--
-- Depth is not nullable. A pH with no depth cannot be compared with the pH
-- from the next paddock, and national soil datasets are depth-based for that
-- reason. The interpreted label lives here; everything with a unit lives in
-- soil_results.

create table if not exists soil_samples (
  sample_id uuid primary key,
  site_id uuid not null references sites(site_id) on delete cascade,
  soil_source text not null default 'lab',
  soil_classification text not null default '',
  -- Which system the label belongs to. "Red Chromosol" under the Australian
  -- Soil Classification and a grower's "red loam" are both useful and are not
  -- the same statement.
  classification_system text not null default 'unspecified',
  -- A sampling day, not an instant, so date rather than timestamptz.
  sample_date date not null,
  sample_point_id text not null default '',
  lat double precision,
  lon double precision,
  depth_from_cm numeric not null,
  depth_to_cm numeric not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  constraint soil_depth_ordered check (depth_to_cm > depth_from_cm),
  constraint soil_depth_positive check (depth_from_cm >= 0)
);

create index if not exists soil_samples_site_idx on soil_samples (site_id, depth_from_cm);

create table if not exists soil_results (
  result_id uuid primary key,
  sample_id uuid not null references soil_samples(sample_id) on delete cascade,
  -- Controlled code: ph_cacl2 and ph_water are separate attributes on purpose.
  -- They differ by roughly half a unit on the same sample, so a dataset that
  -- merges them is wrong in a direction nobody can see.
  attribute_code text not null,
  attribute_name text not null default '',
  value double precision,
  -- Some results are words: a texture grade, a colour.
  text_value text not null default '',
  -- Explicit, never implied by the attribute.
  unit text not null default '',
  -- The method changes what the number means, so it travels with it.
  method_code text not null default 'unspecified',
  method_ref text not null default '',
  created_at timestamptz not null default now(),
  constraint soil_result_has_a_value check (value is not null or text_value <> '')
);

create index if not exists soil_results_sample_idx on soil_results (sample_id, attribute_code);

-- Row-level security, matching the policy the rest of the schema runs under:
-- the anon key may read, insert and update, but not delete. Written here
-- rather than later — a new table without policies is either wide open or
-- silently unreadable, and both are found the hard way.
alter table weather_observations enable row level security;
alter table soil_samples enable row level security;
alter table soil_results enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['weather_observations', 'soil_samples', 'soil_results']
  loop
    execute format('drop policy if exists anon_read on %I', table_name);
    execute format('drop policy if exists anon_insert on %I', table_name);
    execute format('drop policy if exists anon_update on %I', table_name);
    execute format('create policy anon_read on %I for select to anon using (true)', table_name);
    execute format('create policy anon_insert on %I for insert to anon with check (true)', table_name);
    execute format('create policy anon_update on %I for update to anon using (true) with check (true)', table_name);
  end loop;
end;
$$;

comment on table weather_observations is
  'Station-keyed time series. Not linked to a trial: sites point at a station so nearby trials share one set of rows.';
comment on column weather_observations.rainfall_since_9am_mm is
  'BOM rain_trace — cumulative since 9am local. Do not SUM this column; take each rain day''s maximum.';
comment on table soil_samples is
  'One sampling event: point, date and depth interval. Carries the interpreted classification.';
comment on table soil_results is
  'One measured attribute per row, with its unit and method. Long format so a new attribute needs no migration.';
