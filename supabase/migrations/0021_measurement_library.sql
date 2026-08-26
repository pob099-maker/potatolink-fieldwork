-- A shared list of the things trials record.
--
-- The soil vocabulary already does this: ph_cacl2 carries its own name, unit
-- and plausible bounds, so a laboratory result cannot arrive as "pH" in mg/kg.
-- Field measurements had no equivalent, so every trial invented its own — and
-- three trials measuring one thing called it "Yield", "yield t/ha" and
-- "Marketable wt", which cannot be pooled by anybody, ever.
--
-- Only what somebody ADDS is stored here. The shipped list lives in the app's
-- own code (services/measurementLibrary.ts) rather than in this table, for two
-- reasons. A pull removes local records the cloud does not have, so a seeded
-- built-in would disappear the first time a device synced — exactly what
-- happened to the demo forms before their rows were added to seed.sql. And a
-- list in code improves when the app does, instead of being frozen at whatever
-- was seeded a year ago.
--
-- So: built-ins ship, additions persist, and the table holds only the second.

create table if not exists measurement_library (
  entry_id uuid primary key,
  -- The stable machine name. This is the whole point: two trials choosing the
  -- same code can be pooled, and two trials that typed their own labels never
  -- can.
  code text not null unique,
  label text not null,
  type text not null,
  unit text not null default '',
  min_value double precision,
  max_value double precision,
  -- For a list to pick from.
  options jsonb,
  guidance text not null default '',
  source text not null default 'added',
  -- Rises as it gets used, so what this programme actually measures floats to
  -- the top of the list instead of sitting under the alphabet.
  usage_count integer not null default 1,
  created_at timestamptz not null default now()
);

-- Case-insensitive, so "Stem count" and "stem count" collide rather than
-- becoming two entries that quietly mean the same thing.
create unique index if not exists measurement_library_label_idx
  on measurement_library (lower(label));

alter table measurement_library enable row level security;

-- Created rather than dropped and recreated: a migration whose only drops
-- target its own new policies still reads as destructive, and stops somebody
-- mid-run for no reason.
do $$
begin
  begin
    execute 'create policy anon_read on measurement_library for select to anon using (true)';
  exception when duplicate_object then null;
  end;
  begin
    execute 'create policy anon_insert on measurement_library for insert to anon with check (true)';
  exception when duplicate_object then null;
  end;
  begin
    execute 'create policy anon_update on measurement_library for update to anon using (true) with check (true)';
  exception when duplicate_object then null;
  end;
end;
$$;

comment on table measurement_library is
  'Measurements people have added. The shipped list lives in the app code, not here.';
comment on column measurement_library.code is
  'Stable machine name. Two trials sharing a code can be pooled; two that typed labels cannot.';
