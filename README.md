# PotatoLink Fieldwork

Agricultural trial data collection and economics platform for PotatoLink extension
programs. First use case: the **Downs CropVision optical sorter trial**, comparing
existing post-harvest handling against optical sorter practices at Walkers Flat (SA)
and Tasmania. The platform is project-agnostic — new trial types only need new form
template configs, not schema or code changes.

## What's in the MVP

- **Grower data entry** — mobile-first, form-template driven, works fully offline.
  Entries save to the device (IndexedDB) and sync to Supabase when online.
- **Photos and videos** — captured with the device camera, held on-device, and
  uploaded to Supabase Storage during sync (photos up to 20 MB, videos up to
  100 MB). Synced media is linked from the trial detail page.
- **Staff dashboard** — trials with status/site/entry counts, recent entries, sync summary.
- **Trial detail** — practice arms (control + alternatives) with per-arm summary
  metrics and measurement events.
- **Access-code gate** on the grower form (real auth comes in a later stage).

Out of scope for this stage (see `docs/PROMPT.md`): the economics engine, results
comparison views, real authentication, adoption follow-up, CRM integration, and the
form template builder.

## Stack

React 18 + TypeScript (strict) · Vite · Tailwind CSS v4 · React Router ·
React Query · React Hook Form + Zod · Supabase (Postgres) · Vitest

## Getting started

```
npm install
npm run dev
```

The app seeds itself with the CropVision trial on first run and works entirely
offline — no backend needed for local development.

To connect a Supabase project:

1. Create a project at supabase.com, then run `supabase/migrations/0001_init.sql`
   and `supabase/seed.sql` in its SQL editor.
2. Copy `.env.example` to `.env.local` and fill in the project URL and anon key.
3. Restart the dev server. Pending entries sync automatically; the Settings page
   has manual sync controls.

## Commands

```
npm run dev          # Start dev server
npm run build        # Production build
npm run test         # Run tests
npm run lint         # ESLint check
npm run typecheck    # TypeScript strict check
```

## Project docs

- `CLAUDE.md` — project rules and conventions
- `docs/PROMPT.md` — the MVP build brief
- `docs/schema.md` — data model (control-plus-multiple-arms pattern)
