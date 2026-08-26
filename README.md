# Fieldwork

Trial data collection for agricultural extension and research. Set up a trial,
record observations in a paddock with no signal, and get tidy data out.

Nothing in it is specific to one crop — trials, sites, what is being compared
and the questions asked are all configuration. It was built for the PotatoLink
CropVision optical sorter trial and carries three demonstration trials, all
marked **Example** in the app and removable.

## Who it is for

Three people use it, and the app is organised around that rather than around
its own data model.

**Whoever designs a trial** answers a few questions — what is being compared,
where, replicated or not, what gets recorded — or imports a protocol that
already lives in a spreadsheet. Either way the result is a trial that can take
entries immediately.

**Whoever runs it** sees what has come back, whether a replicated design is
filled in, and gets the data out as a CSV that drops into R or GenStat.

**Whoever records in the field** taps a link, picks the plot they are standing
in, and answers four questions a screen. It works offline and says so.

## What it does

**Designed trials.** Completely randomised or randomised complete block, with
each site arranged independently from one stored seed — so the layout is
reproducible, and a gradient two paddocks share is not confounded the same way
at both. The fieldbook exports as CSV. The arrangement freezes once anything
has been recorded against a plot, because changing it afterwards would
silently re-label every existing record.

**Recording against a plot.** With a layout, the field question is the number
on the peg; the practice and the replicate are looked up rather than asked for.
Photos and video are captured on-device and uploaded during sync.

**Yield without arithmetic in a paddock.** A trial records its plot size, and a
weight in kg or t shows tonnes per hectare as it is typed. A strip's area can
be measured by walking it — the width is the machine's, so only the length is
measured. Strips of unequal length carry their own area.

**Honest statistics.** Descriptive means and standard errors per treatment,
never a significance test. Several readings in one plot are averaged before
treatments are compared, because randomisation was applied to plots — counting
each reading separately would understate the error.

**Economics**, as a what-if tool rather than a finding: what the trial measured
combined with cost assumptions you can change, with unconfirmed figures flagged
until they are replaced with real ones.

**Offline first, app and all.** Entries save to the device and sync when there
is signal, and a queued save that will never go through says so rather than
retrying silently. The app itself is cached too — typefaces, styles and code
are bundled and precached, so it opens in a paddock with no signal rather than
depending on whatever the browser happened to keep. Verified by serving a
build, installing the worker, shutting the server down and reloading: nothing
served, page renders.

**Installable.** Add to home screen on a phone and it opens like an app, from
its own icon, without the browser furniture. When a new version is deployed the
app says so and waits — it never reloads out from under a half-finished entry
form.

**A lifecycle.** A finished trial can be closed and archived — out of the lists,
still fully readable, back with one tap.

**Observation timing, anchored to the crop.** Protocols say "at tuber
initiation", not "on 14 October", because a season that runs late moves every
date with it. Each site records its planting date; each form says which growth
stage it hangs off. Until the stage arrives the app shows an estimated window
and says so; confirm the stage and every date hanging off it re-anchors to the
real one. The dashboard shows what is due or late, and the schedule exports as
a calendar file so the phone's own calendar does the reminding — Fieldwork has
no server and cannot send anything, which is stated rather than worked around.

**Provenance.** A trial records where its data comes from — a sensor datastream,
a machinery export, a protocol — scoped to a plot, a treatment, a site or the
trial, and every exported row names the sources covering it.

## Connecting to other systems

Nothing is fetched or parsed today; the app records *where* data comes from, not
the data itself. What it would take to change that, what has to be settled
first, and what cannot be promised without real data to test against:
[docs/INTEGRATIONS.md](docs/INTEGRATIONS.md).

## Access

Fieldwork is **deliberately open** while it is being tried out: anyone with the
link can change a trial, and the key it uses is compiled into the JavaScript.
That is a considered choice for a testing period, not an oversight.

[docs/GO-LIVE.md](docs/GO-LIVE.md) is the other half of it — the ordered steps
to lock it down, why the order matters, and what lock-down does *not* do. Worth
reading before real grower contact details go anywhere near it.

## Stack

React 18 + TypeScript (strict) · Vite · Tailwind CSS v4 · React Router ·
React Query · React Hook Form + Zod · Supabase (Postgres) · Vitest

## Getting started

```
npm install
npm run dev
```

It seeds itself on first run and works entirely offline — no backend needed for
local development.

To connect a Supabase project:

1. Create a project at supabase.com, then run the migrations in
   `supabase/migrations/` in order, followed by `supabase/seed.sql`.
2. Copy `.env.example` to `.env.local` and fill in the project URL and anon key.
3. Restart the dev server. Pending entries sync automatically; Settings has
   manual sync controls and says what this device is for.

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
- `docs/GO-LIVE.md` — how to lock the app down, in order
- `docs/INTEGRATIONS.md` — connecting to sensors, machinery and farm software
- `docs/schema.md` — data model (control-plus-multiple-arms pattern)
- `docs/replicated-trials-design.md` — what the app will and will not claim
  statistically
- `docs/adding-a-new-trial.md` — setting one up
- `docs/staff-sign-in.md` — the auth that is built but not switched on
- `docs/PROMPT.md` — the original MVP brief, kept for history. It describes a
  much smaller app and a placeholder palette; where it disagrees with this
  README or `CLAUDE.md`, it is out of date.
