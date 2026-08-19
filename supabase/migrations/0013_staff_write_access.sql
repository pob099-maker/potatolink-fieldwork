-- NOT YET APPLIED. Run this only after a staff sign-in has actually worked
-- on the live site, because it is the step that makes the anon key unable to
-- change a trial. Applying it while nobody can sign in locks the whole team
-- out of trial setup, on an app colleagues are already using.
--
-- What it changes, and what it deliberately does not:
--
-- Structure — trials, sites, practices, forms, economics — becomes writable
-- only by a signed-in staff account. That is the actual exposure: the app
-- guards those pages in the browser, but the anon key would still accept the
-- writes from anyone who read it out of the bundle.
--
-- Recording data stays open to the anon key. Growers have no accounts and
-- should not need one; requiring a sign-in to fill in a form is how you end
-- up with no data. The shared access code still gates the form in the app,
-- and a correction is part of recording, so entries keep update and delete.
--
-- Reads stay open, because the entry form has to load its own trial, site,
-- practice and questions before anyone has signed in to anything.

-- 1. Signed-in staff can do everything, on every table.
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
    execute format(
      'create policy staff_all on %I for all to authenticated using (true) with check (true)',
      table_name
    );
  end loop;
end;
$$;

-- 2. The anon key loses the ability to change a trial's structure.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'projects', 'trials', 'contacts', 'sites', 'practice_arms', 'arm_assumptions',
    'economic_scenarios', 'result_sets', 'adoption_followups', 'form_templates'
  ]
  loop
    execute format('drop policy if exists anon_insert on %I', table_name);
    execute format('drop policy if exists anon_update on %I', table_name);
    execute format('drop policy if exists anon_delete on %I', table_name);
  end loop;
end;
$$;

-- measurement_events, metrics and data_entry_logs keep their anon policies on
-- purpose: that is the grower's paddock workflow, and it has to keep working
-- with nothing but the link and the code.
