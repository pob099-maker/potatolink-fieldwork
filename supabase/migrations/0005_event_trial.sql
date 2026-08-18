-- Every record must know which trial it belongs to.
--
-- Allowing staff forms to record without a site or an arm (0004) left
-- trial-level records such as a cost log with no link to their trial at all:
-- they could be saved and synced, but never listed or counted anywhere.

alter table measurement_events
  add column if not exists trial_id uuid references trials (trial_id);

-- Backfill from whichever reference the row already has.
update measurement_events e
set trial_id = s.trial_id
from sites s
where e.trial_id is null and e.site_id = s.site_id;

update measurement_events e
set trial_id = a.trial_id
from practice_arms a
where e.trial_id is null and e.arm_id = a.arm_id;

create index if not exists measurement_events_trial_date
  on measurement_events (trial_id, event_date);
