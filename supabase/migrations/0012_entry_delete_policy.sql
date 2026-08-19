-- Entries can now be corrected or removed in the app, so a delete has to be
-- able to reach the cloud. Same stance as practice arms (0007) and sites
-- (0010): anon already has update, and a removal that only happens on one
-- device is worse than no removal at all — the next pull brings it back.
create policy anon_delete on data_entry_logs for delete to anon using (true);
create policy anon_delete on metrics for delete to anon using (true);
create policy anon_delete on measurement_events for delete to anon using (true);

-- Corrections need a timestamp to settle who wrote last, exactly as the
-- config tables already have.
alter table measurement_events add column if not exists updated_at timestamptz;
alter table metrics add column if not exists updated_at timestamptz;
