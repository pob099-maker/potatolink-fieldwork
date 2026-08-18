-- Timestamped last-writer-wins for editable config records (review S-1).
--
-- Without an updated_at, a cloud pull overwrote a newer local edit by pull
-- order alone. These columns let the client keep the newer copy and skip the
-- stale one. Nullable: seed rows created before this leave it null and fall
-- back to created_at in the comparison.

alter table form_templates    add column if not exists updated_at timestamptz;
alter table practice_arms      add column if not exists updated_at timestamptz;
alter table arm_assumptions    add column if not exists updated_at timestamptz;
alter table economic_scenarios add column if not exists updated_at timestamptz;
