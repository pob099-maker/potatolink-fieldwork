-- Seed for the Downs CropVision trial. IDs match src/services/seed.ts so a
-- device seeded locally lines up with a Supabase project seeded from here.

insert into projects (project_id, name, funder, start_date, end_date, status)
values ('5f0a6c1e-0001-4000-8000-000000000001', 'Potato Mechanisation Program',
        'Hort Innovation', '2026-07-01', '2028-06-30', 'active')
on conflict do nothing;

insert into trials (trial_id, project_id, name, objective, status)
values ('5f0a6c1e-0002-4000-8000-000000000001', '5f0a6c1e-0001-4000-8000-000000000001',
        'Downs CropVision Post-Harvest Handling Comparison',
        'Compare existing post-harvest handling against optical sorter practices across sites in Walkers Flat (SA) and Tasmania.',
        'active')
on conflict do nothing;

insert into contacts (contact_id, name, business, role, region, tags)
values
  ('5f0a6c1e-0005-4000-8000-000000000001', 'Sample Grower', 'Walkers Flat Produce', 'grower', 'Murraylands SA', '{cropvision-trial}'),
  ('5f0a6c1e-0005-4000-8000-000000000002', 'PotatoLink Staff', 'PotatoLink', 'staff', 'National', '{}')
on conflict do nothing;

insert into sites (site_id, trial_id, contact_id, location, region, soil_type)
values
  ('5f0a6c1e-0003-4000-8000-000000000001', '5f0a6c1e-0002-4000-8000-000000000001',
   '5f0a6c1e-0005-4000-8000-000000000001', 'Walkers Flat', 'South Australia', 'Sandy loam'),
  ('5f0a6c1e-0003-4000-8000-000000000002', '5f0a6c1e-0002-4000-8000-000000000001',
   '5f0a6c1e-0005-4000-8000-000000000001', 'Tasmania', 'Tasmania', 'Ferrosol')
on conflict do nothing;

insert into practice_arms (arm_id, trial_id, name, type, description, sort_order)
values
  ('5f0a6c1e-0004-4000-8000-000000000001', '5f0a6c1e-0002-4000-8000-000000000001',
   'Existing post-harvest handling', 'control', 'Current practice without an optical sorter.', 0),
  ('5f0a6c1e-0004-4000-8000-000000000002', '5f0a6c1e-0002-4000-8000-000000000001',
   'CropVision — on-farm owned unit', 'alternative', 'Optical sorter owned and operated on farm.', 1),
  ('5f0a6c1e-0004-4000-8000-000000000003', '5f0a6c1e-0002-4000-8000-000000000001',
   'CropVision — shared/service model', 'alternative', 'Optical sorter accessed through a shared or contracted service.', 2),
  ('5f0a6c1e-0004-4000-8000-000000000004', '5f0a6c1e-0002-4000-8000-000000000001',
   'Improved handling without optical sorter', 'alternative', 'Upgraded conventional handling practices, no optical sorter.', 3)
on conflict do nothing;

insert into form_templates (template_id, trial_id, arm_id, name, fields)
values ('5f0a6c1e-0006-4000-8000-000000000001', '5f0a6c1e-0002-4000-8000-000000000001', null,
        'CropVision run record',
        '[
          {"fieldName":"tonnesHandled","label":"Tonnes handled","type":"number","required":true,"options":null,"min":0,"max":null,"unit":"t","displayOrder":0},
          {"fieldName":"runDuration","label":"How long did the run take?","type":"number","required":true,"options":null,"min":0,"max":null,"unit":"hours","displayOrder":1},
          {"fieldName":"peopleInvolved","label":"People involved","type":"number","required":true,"options":null,"min":1,"max":null,"unit":null,"displayOrder":2},
          {"fieldName":"runWentAsPlanned","label":"Did the run go as planned?","type":"boolean","required":true,"options":null,"min":null,"max":null,"unit":null,"displayOrder":3},
          {"fieldName":"photo","label":"Photo of the run (optional)","type":"photo","required":false,"options":null,"min":null,"max":null,"unit":null,"displayOrder":4},
          {"fieldName":"sortingResult","label":"How well did the sorting work?","type":"slider","required":false,"options":null,"min":1,"max":5,"unit":null,"displayOrder":5},
          {"fieldName":"mainRemovalCategory","label":"Main thing removed","type":"select","required":false,"options":["clods/stones","damaged tubers","rot","green potatoes","misshapes","foreign material","no meaningful separation"],"min":null,"max":null,"unit":null,"displayOrder":6},
          {"fieldName":"notes","label":"Anything else worth noting?","type":"text","required":false,"options":null,"min":null,"max":null,"unit":null,"displayOrder":7}
        ]'::jsonb)
on conflict do nothing;
