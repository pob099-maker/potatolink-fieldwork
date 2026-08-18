-- PotatoLink Fieldwork — initial schema (Postgres translation of docs/schema.md)
-- Control-plus-multiple-arms pattern: one trial, one control arm, N alternatives.

create table projects (
  project_id uuid primary key,
  name text not null,
  funder text not null default '',
  start_date timestamptz not null,
  end_date timestamptz not null,
  status text not null default 'active' check (status in ('active', 'completed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table trials (
  trial_id uuid primary key,
  project_id uuid not null references projects (project_id),
  name text not null,
  objective text not null default '',
  status text not null default 'draft' check (status in ('draft', 'active', 'completed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table contacts (
  contact_id uuid primary key,
  name text not null,
  business text not null default '',
  role text not null check (role in ('grower', 'staff', 'cooperator', 'vendor')),
  region text not null default '',
  email text not null default '',
  phone text not null default '',
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table sites (
  site_id uuid primary key,
  trial_id uuid not null references trials (trial_id),
  contact_id uuid not null references contacts (contact_id),
  location text not null,
  region text not null default '',
  soil_type text not null default '',
  coordinates jsonb,
  created_at timestamptz not null default now()
);

create table practice_arms (
  arm_id uuid primary key,
  trial_id uuid not null references trials (trial_id),
  name text not null,
  type text not null check (type in ('control', 'alternative')),
  description text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table arm_assumptions (
  assumption_id uuid primary key,
  arm_id uuid not null references practice_arms (arm_id),
  category text not null check (category in ('capex', 'opex', 'labour', 'revenue', 'other')),
  field_name text not null,
  value jsonb not null,
  unit text not null default '',
  created_at timestamptz not null default now()
);

create table measurement_events (
  event_id uuid primary key,
  site_id uuid not null references sites (site_id),
  arm_id uuid not null references practice_arms (arm_id),
  event_date timestamptz not null,
  event_type text not null,
  entered_by text not null default '',
  sync_status text not null default 'synced' check (sync_status in ('pending', 'synced', 'error')),
  created_at timestamptz not null default now()
);

create table metrics (
  metric_id uuid primary key,
  event_id uuid not null references measurement_events (event_id),
  metric_name text not null,
  value jsonb not null,
  unit text not null default '',
  photo_url text,
  created_at timestamptz not null default now()
);

create table economic_scenarios (
  scenario_id uuid primary key,
  trial_id uuid not null references trials (trial_id),
  name text not null,
  assumptions_json text not null default '{}',
  created_at timestamptz not null default now()
);

create table result_sets (
  result_id uuid primary key,
  scenario_id uuid not null references economic_scenarios (scenario_id),
  arm_id uuid not null references practice_arms (arm_id),
  net_benefit numeric not null,
  payback_period numeric,
  notes text not null default '',
  calculated_at timestamptz not null default now()
);

create table adoption_followups (
  followup_id uuid primary key,
  trial_id uuid not null references trials (trial_id),
  contact_id uuid not null references contacts (contact_id),
  adoption_status text not null default 'not_started'
    check (adoption_status in ('not_started', 'considering', 'trialling', 'adopted', 'rejected')),
  behaviour_notes text not null default '',
  followup_date timestamptz not null,
  created_at timestamptz not null default now()
);

create table form_templates (
  template_id uuid primary key,
  trial_id uuid not null references trials (trial_id),
  arm_id uuid references practice_arms (arm_id),
  name text not null,
  fields jsonb not null,
  created_at timestamptz not null default now()
);

create table data_entry_logs (
  entry_id uuid primary key,
  event_id uuid not null references measurement_events (event_id),
  entered_by text not null default '',
  entry_date timestamptz not null,
  device_type text not null check (device_type in ('mobile', 'tablet', 'desktop')),
  sync_status text not null default 'synced' check (sync_status in ('pending', 'synced', 'error')),
  created_at timestamptz not null default now()
);

-- Indexes from docs/schema.md
create index trials_project_status on trials (project_id, status);
create index practice_arms_trial_type on practice_arms (trial_id, type);
create index measurement_events_site_date on measurement_events (site_id, event_date);
create index measurement_events_arm_date on measurement_events (arm_id, event_date);
create index metrics_event_name on metrics (event_id, metric_name);
create unique index contacts_email_unique on contacts (email) where email <> '';
create index form_templates_trial_arm on form_templates (trial_id, arm_id);

-- Row-level security. MVP policy: the anon key may read and insert but not
-- delete; tighten these when real auth replaces the access-code gate.
alter table projects enable row level security;
alter table trials enable row level security;
alter table contacts enable row level security;
alter table sites enable row level security;
alter table practice_arms enable row level security;
alter table arm_assumptions enable row level security;
alter table measurement_events enable row level security;
alter table metrics enable row level security;
alter table economic_scenarios enable row level security;
alter table result_sets enable row level security;
alter table adoption_followups enable row level security;
alter table form_templates enable row level security;
alter table data_entry_logs enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'projects', 'trials', 'contacts', 'sites', 'practice_arms', 'arm_assumptions',
    'measurement_events', 'metrics', 'economic_scenarios', 'result_sets',
    'adoption_followups', 'form_templates', 'data_entry_logs'
  ]
  loop
    execute format('create policy anon_read on %I for select to anon using (true)', table_name);
    execute format('create policy anon_insert on %I for insert to anon with check (true)', table_name);
    execute format('create policy anon_update on %I for update to anon using (true) with check (true)', table_name);
  end loop;
end;
$$;
