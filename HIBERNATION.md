# Hibernated — 19 August 2026

Development stopped here. The assessment team did not take the tool up, so it
is parked rather than abandoned: everything needed to bring it back is in this
repository.

## What this was

Trial data collection and economics for PotatoLink extension programs, built
around the Downs CropVision optical sorter trial at Walkers Flat (SA) and in
Tasmania. Growers record runs on a phone in the paddock, offline, and the data
syncs when a signal returns.

Live at the time of hibernation:
<https://pob099-maker.github.io/potatolink-fieldwork/>

## What is preserved, and where

**The code** — this repository, `main` branch. It builds and deploys from here
with no other input.

**The data** — `snapshot/*.json`, one file per table, taken 19 Aug 2026 from the
Supabase project `fieldnotes` (`wqyjpgjztaiigyjijdxt`). 100 rows across 13
tables: 6 trials, 6 sites, 12 practices, 13 form templates, 7 recorded entries
and 33 measurements.

**The schema** — `supabase/migrations/`, 0001 through 0013, applied in order.
0013 was never applied; see below.

**The seed data** — `src/services/seed.ts`. Worth knowing: the seeded arm
assumptions live only in each browser's IndexedDB, never in Supabase, because
`pushBaseData` does not push them. That is why the snapshot has one assumption
and the app showed twelve. Nothing is lost — they are reproduced from the seed
on first run.

## To bring it back

1. `npm install && npm run dev` runs the whole app locally with no backend at
   all. It falls back to on-device storage and says so. That is enough to see
   what it does.
2. For the full thing, create a Supabase project, run `supabase/migrations/`
   in order, and restore `snapshot/*.json` into the matching tables.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, and the GitHub Pages
   workflow deploys on push to `main`.

## Two things left unfinished

**Staff sign-in is built but switched off.** `VITE_REQUIRE_STAFF_SIGNIN` is set
to `false` in the deploy workflow, so every staff page is reachable by anyone
with the address. `docs/staff-sign-in.md` has the five steps to turn it on, in
the order that avoids locking yourself out. Step 1 — closing open sign-ups in
Supabase — is the one that matters, and migration `0013_staff_write_access.sql`
is written but deliberately **not applied**, because it grants every signed-in
account write access and would be worse than nothing while sign-ups are open.

**The economics figures are invented.** Every cost and return in the seed data
is a placeholder I made up so the calculations had something to work with. The
app says so itself, on the results page, in the banner added by PR #31. Nothing
in there is Downs' actual numbers.

## If this is revived commercially

The code is deliberately generic — trials, sites, practices, forms and
economics are all configuration, never hardcoded to potatoes or to this project.
Retargeting it is mostly content and branding.

Two things to sort out before that, though, and they are not technical:

- **The branding** is PotatoLink throughout: the name, the palette in
  `src/index.css`, the potato mark in `Layout.tsx`, and the "Australian Potato
  Industry Extension Project" descriptor. All of it would need to come out.
- **The IP position.** This was built against a brief for a levy-funded
  Hort Innovation project, even though the development was self-funded. Whether
  the design and the domain model are yours to commercialise is a question for
  whoever holds the project agreement, and worth settling before rather than
  after building on it.
