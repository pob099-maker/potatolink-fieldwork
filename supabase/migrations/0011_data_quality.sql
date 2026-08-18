-- Data-quality pass from the architecture review.

-- E-1: tell a modelled figure built on invented numbers from one built on
-- confirmed trial inputs. Placeholder is the safe default, so nothing is
-- presented as verified until someone says it is.
alter table arm_assumptions
  add column if not exists status text not null default 'placeholder'
    check (status in ('placeholder', 'confirmed'));

-- S-4: removing an assumption only zeroed the cloud row, so another device
-- pulled it back as a live $0 line. Let the delete actually happen.
create policy anon_delete on arm_assumptions for delete to anon using (true);
