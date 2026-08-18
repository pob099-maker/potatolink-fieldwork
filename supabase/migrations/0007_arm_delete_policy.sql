-- Let the app's hard-delete of an empty practice actually reach the cloud.
--
-- The MVP policies granted anon read/insert/update but not delete, so deleting
-- a practice arm with no data succeeded locally and then silently reappeared
-- on the next cloud pull. Deleting an empty arm is no more destructive than
-- the update permission anon already has; this is superseded by real auth.
create policy anon_delete on practice_arms for delete to anon using (true);
