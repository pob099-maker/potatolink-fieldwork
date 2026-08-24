-- A trial created by mistake can now be removed in the app, so the delete has
-- to be able to reach the cloud.
--
-- Without these three policies the removal half-works in the worst way: the
-- trial goes from the device and is queued for the cloud, the queue is refused
-- by row-level security, and it retries forever while the rows sit there. The
-- other tables in the cascade already have their policies — sites (0010),
-- practice arms (0007), assumptions (0011) — these are the ones that were
-- missing.
--
-- Same stance as those: anon already has update, and the app only ever deletes
-- a trial with nothing recorded against it. Superseded by 0013 when real auth
-- is switched on.
create policy anon_delete on trials for delete to anon using (true);
create policy anon_delete on form_templates for delete to anon using (true);
create policy anon_delete on economic_scenarios for delete to anon using (true);
