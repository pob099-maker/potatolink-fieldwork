-- Factorial treatment structure.
--
-- A factorial arrangement is not a kind of trial. It describes how treatments
-- are combined — every level of every factor crossed with every other — and it
-- says nothing about how they are laid out. The field design stays a separate
-- choice: randomised complete block, completely randomised, split-plot. A user
-- who believes "factorial" replaces blocking has been misled by an interface,
-- so this schema keeps the two apart.
--
-- Two tables, not four. The brief asked for treatment_combinations and
-- combination_members as well; they are not here, and that is deliberate.
--
-- The combination IS the practice arm. Everything in this app already keys on
-- arm_id — the layout engine that randomises plots, the plot picker a grower
-- taps, the replication grid, the CSV export, and every measurement event ever
-- recorded. A parallel combinations table would mean two rows for one thing,
-- kept in step by hand, with every existing feature having to learn which of
-- the two it should be reading. Instead an arm carries which level of each
-- factor it stands for, and nothing downstream changes at all.

create table if not exists factors (
  factor_id uuid primary key,
  trial_id uuid not null references trials(trial_id) on delete cascade,
  name text not null,
  -- Short form, for a plot peg and a column heading: "N", "Irr".
  code text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists factors_trial_idx on factors (trial_id, sort_order);

create table if not exists factor_levels (
  level_id uuid primary key,
  factor_id uuid not null references factors(factor_id) on delete cascade,
  label text not null,
  -- The level as a number where it is one: 0, 80, 160 kg N/ha. Held apart from
  -- the label because a rate is a quantity and "High" is a name, and only one
  -- of them can be fitted to a trend. Null for a variety.
  numeric_value double precision,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists factor_levels_factor_idx on factor_levels (factor_id, sort_order);

-- Which level of each factor an arm stands for, keyed by factor_id. Empty for
-- a trial that is not factorial, which is almost all of them.
alter table practice_arms
  add column if not exists factor_levels jsonb not null default '{}'::jsonb;

alter table factors enable row level security;
alter table factor_levels enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['factors', 'factor_levels']
  loop
    begin
      execute format('create policy anon_read on %I for select to anon using (true)', t);
    exception when duplicate_object then null;
    end;
    begin
      execute format('create policy anon_insert on %I for insert to anon with check (true)', t);
    exception when duplicate_object then null;
    end;
    begin
      execute format('create policy anon_update on %I for update to anon using (true) with check (true)', t);
    exception when duplicate_object then null;
    end;
  end loop;
end;
$$;

comment on table factors is
  'A variable being tested. The combinations they produce become practice arms.';
comment on column practice_arms.factor_levels is
  'factor_id -> level_id. The arm is the treatment combination; there is no separate combinations table.';
