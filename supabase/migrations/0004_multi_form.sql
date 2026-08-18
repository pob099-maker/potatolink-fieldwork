-- Several forms per trial, not just the per-pass grower record.
--
-- A trial protocol has stages beyond the harvest run: site setup, equipment
-- calibration, daily weather, portal checks, observer feedback, cost logs.
-- They differ in who fills them in, how often, and what they attach to — a
-- cost log belongs to the trial, not to a harvester pass — so events may now
-- record without a site or an arm.

alter table form_templates
  add column if not exists event_type text not null default 'field_record',
  add column if not exists audience text not null default 'grower'
    check (audience in ('grower', 'staff')),
  add column if not exists frequency text not null default '',
  add column if not exists requires_site boolean not null default true,
  add column if not exists requires_arm boolean not null default true;

alter table measurement_events
  alter column site_id drop not null,
  alter column arm_id drop not null;

create index if not exists form_templates_trial_event
  on form_templates (trial_id, event_type);
