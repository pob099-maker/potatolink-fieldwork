-- Economics per site. A scenario with a null site_id applies trial-wide and
-- acts as the fallback for any site without its own scenario; results record
-- the site they were calculated for.
--
-- Season conditions (throughput, price, labour rate) genuinely differ between
-- sites — freight and labour rates alone separate Walkers Flat from Tasmania —
-- so a single blended payback figure across sites would mislead.

alter table economic_scenarios
  add column if not exists site_id uuid references sites (site_id);

alter table result_sets
  add column if not exists site_id uuid references sites (site_id);

create index if not exists economic_scenarios_trial_site
  on economic_scenarios (trial_id, site_id);

create index if not exists result_sets_scenario_site
  on result_sets (scenario_id, site_id);
