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
          {"fieldName":"notes","label":"Anything else worth noting?","type":"text","required":false,"options":null,"min":null,"max":null,"unit":null,"displayOrder":7},
          {"fieldName":"video","label":"Short video of the run (optional)","type":"video","required":false,"options":null,"min":null,"max":null,"unit":null,"displayOrder":8}
        ]'::jsonb)
on conflict do nothing;

-- HarvestEye viability trial (North Queensland), from docs/harvesteye_trial_protocol.csv

insert into trials (trial_id, project_id, name, objective, status)
values ('5f0a6c1e-0002-4000-8000-000000000002', '5f0a6c1e-0001-4000-8000-000000000001',
        'HarvestEye Viability Trial — North Queensland',
        'Validate HarvestEye in-field size and count accuracy against manual grading, and assess fit-up effort, operational disruption, and labour ROI on North Queensland harvest conditions.',
        'draft')
on conflict do nothing;

insert into contacts (contact_id, name, business, role, region, tags)
values ('5f0a6c1e-0005-4000-8000-000000000003', 'North QLD Cooperator (TBC)', '', 'cooperator', 'North Queensland', '{harvesteye-trial}')
on conflict do nothing;

insert into sites (site_id, trial_id, contact_id, location, region, soil_type)
values ('5f0a6c1e-0003-4000-8000-000000000003', '5f0a6c1e-0002-4000-8000-000000000002',
        '5f0a6c1e-0005-4000-8000-000000000003', 'Atherton Tablelands', 'North Queensland', 'Red ferrosol')
on conflict do nothing;

insert into practice_arms (arm_id, trial_id, name, type, description, sort_order)
values
  ('5f0a6c1e-0004-4000-8000-000000000005', '5f0a6c1e-0002-4000-8000-000000000002',
   'Manual grading (current practice)', 'control', 'Hand-graded samples only; no in-field sensing.', 0),
  ('5f0a6c1e-0004-4000-8000-000000000006', '5f0a6c1e-0002-4000-8000-000000000002',
   'HarvestEye-fitted harvester', 'alternative', 'HarvestEye unit mounted on the harvester, validated against hand grading.', 1)
on conflict do nothing;

insert into form_templates (template_id, trial_id, arm_id, name, fields)
values ('5f0a6c1e-0006-4000-8000-000000000002', '5f0a6c1e-0002-4000-8000-000000000002', null,
        'HarvestEye harvest run record',
        '[
          {"fieldName":"varietyName","label":"Variety","type":"text","required":true,"options":null,"min":null,"max":null,"unit":null,"displayOrder":0},
          {"fieldName":"plotId","label":"Plot / row number","type":"text","required":true,"options":null,"min":null,"max":null,"unit":null,"displayOrder":1},
          {"fieldName":"replicate","label":"Replicate number","type":"number","required":true,"options":null,"min":1,"max":null,"unit":null,"displayOrder":2},
          {"fieldName":"harvesterSpeed","label":"Harvester speed","type":"number","required":true,"options":null,"min":0,"max":null,"unit":"km/h","displayOrder":3},
          {"fieldName":"slowDownsFromUnit","label":"Did the unit cause any slow-downs?","type":"boolean","required":true,"options":null,"min":null,"max":null,"unit":null,"displayOrder":4},
          {"fieldName":"marketableYield","label":"HarvestEye marketable yield","type":"number","required":false,"options":null,"min":0,"max":100,"unit":"%","displayOrder":5},
          {"fieldName":"tuberCount","label":"HarvestEye tuber count","type":"number","required":false,"options":null,"min":0,"max":null,"unit":null,"displayOrder":6},
          {"fieldName":"manualSampleWeight","label":"Hand-graded sample weight","type":"number","required":false,"options":null,"min":0,"max":null,"unit":"kg","displayOrder":7},
          {"fieldName":"mainDefect","label":"Defects graded out (choose all that apply)","type":"multiselect","required":false,"options":["none","rot","greening","misshapen","cracking","mechanical damage"],"min":null,"max":null,"unit":null,"displayOrder":8},
          {"fieldName":"defectPhoto","label":"Photo of graded-out tubers (optional)","type":"photo","required":false,"options":null,"min":null,"max":null,"unit":null,"displayOrder":9},
          {"fieldName":"sensorVideo","label":"30–60 s video of tubers passing the sensor (optional)","type":"video","required":false,"options":null,"min":null,"max":null,"unit":null,"displayOrder":10},
          {"fieldName":"csvExport","label":"HarvestEye CSV export (optional)","type":"file","required":false,"options":null,"min":null,"max":null,"unit":null,"displayOrder":11},
          {"fieldName":"passLocation","label":"Where was this pass? (optional)","type":"gps","required":false,"options":null,"min":null,"max":null,"unit":null,"displayOrder":12},
          {"fieldName":"notes","label":"Anything else worth noting?","type":"text","required":false,"options":null,"min":null,"max":null,"unit":null,"displayOrder":13}
        ]'::jsonb)
on conflict do nothing;

-- Nitrogen trial: the rest of the season.
--
-- One form per visit — an emergence count while the crop comes up, a canopy
-- and disease check mid-season, the weights at harvest. Each carries its own
-- timing, so the trial has three schedules rather than one.
--
-- These must exist here as well as in the app's own seed. A pull removes local
-- records the cloud does not have, and a form template carries no sync status
-- to protect it — so a form seeded only on the device appears, then disappears
-- the first time the app syncs. Rows the demo needs to survive belong here.

insert into form_templates (template_id, trial_id, arm_id, name, event_type, frequency, timing, fields)
values ('5f0a6c1e-0006-4000-8000-000000000021', '5f0a6c1e-0002-4000-8000-000000000003', null,
        'Emergence count',
        'emergenceCount',
        'Once per plot, as the crop comes up',
        '{"stage":"emergence","dapFrom":0,"dapTo":7}'::jsonb,
        '[
          {"fieldName":"plantsEmerged","label":"Plants up in the counted rows","type":"number","required":true,"options":null,"min":0,"max":null,"unit":"count","displayOrder":0},
          {"fieldName":"gaps","label":"Any obvious gaps?","type":"boolean","required":false,"options":null,"min":null,"max":null,"unit":null,"displayOrder":1},
          {"fieldName":"notes","label":"Anything worth noting?","type":"text","required":false,"options":null,"min":null,"max":null,"unit":null,"displayOrder":2}
        ]'::jsonb)
on conflict do nothing;

insert into form_templates (template_id, trial_id, arm_id, name, event_type, frequency, timing, fields)
values ('5f0a6c1e-0006-4000-8000-000000000022', '5f0a6c1e-0002-4000-8000-000000000003', null,
        'Canopy and disease check',
        'midSeasonCheck',
        'Once per plot, around tuber initiation',
        '{"stage":"tuberInitiation","dapFrom":null,"dapTo":null}'::jsonb,
        '[
          {"fieldName":"canopyVigour","label":"Canopy vigour","type":"slider","required":true,"options":null,"min":1,"max":5,"unit":null,"displayOrder":0},
          {"fieldName":"diseaseSeen","label":"Any disease showing?","type":"select","required":false,"options":["none","early blight","target spot","something else"],"min":null,"max":null,"unit":null,"displayOrder":1},
          {"fieldName":"photo","label":"Photo of the canopy","type":"photo","required":false,"options":null,"min":null,"max":null,"unit":null,"displayOrder":2}
        ]'::jsonb)
on conflict do nothing;

-- The harvest form belongs at harvest. It used to sit at tuber initiation
-- because it was the trial's only form, so its timing was doing duty as the
-- whole trial's schedule.
update form_templates
   set timing = '{"stage":"harvest","dapFrom":0,"dapTo":14}'::jsonb
 where template_id = '5f0a6c1e-0006-4000-8000-000000000020';
