# PotatoLink Fieldwork — Project Instructions

## What this project is

Agricultural trial data collection and economics platform for PotatoLink extension programs.
First use case: Downs CropVision optical sorter trials (Walkers Flat SA, Tasmania).
The platform must be reusable across future projects: VRI, haulm destruction, mechanisation, irrigation.

## Tech stack

- Frontend: React 18 + TypeScript (strict mode)
- Styling: Tailwind CSS v4
- Backend: Supabase (Postgres + Auth + Storage) — chosen over the original Firebase plan
- State: React Query for server state, local state for UI
- Forms: React Hook Form + Zod validation
- Build: Vite
- Package manager: npm
- Offline: IndexedDB local-first store; entries sync to Supabase when online and configured

## Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run test         # Run tests
npm run lint         # ESLint check
npm run typecheck    # TypeScript strict check
```

## Project structure

```
src/
├── components/       # Reusable UI components
├── pages/            # Route-level pages
├── hooks/            # Custom React hooks
├── lib/              # Supabase client, IndexedDB, utilities
├── types/            # TypeScript interfaces and types
├── schemas/          # Zod validation schemas
├── services/         # Local-first store, sync, and pure domain logic
├── contexts/         # React contexts (auth, theme)
└── assets/           # Static assets
```

## Critical rules

1. MUST use TypeScript strict mode. No `any` types without explicit justification.
2. MUST use named exports. NEVER use default exports.
3. MUST validate all user input with Zod schemas before database writes.
4. MUST handle offline state: save entries locally, sync when online.
5. MUST NOT commit secrets, API keys, or .env files to git.
6. MUST use React Hook Form for all forms. NEVER build raw form state.
7. MUST write row-level security policies before deploying any new table.
8. MUST test on mobile viewport (375px) before considering a feature complete.
9. MUST use semantic HTML elements. NEVER use div where a semantic element exists.
10. MUST include alt text on every img element.
11. MUST keep keyboard focus visible. The Tailwind reset removes it; `:focus-visible`
    styling in `src/index.css` puts it back. Never add `focus:outline-none` — it beats
    `:focus-visible` on specificity and silently removes the ring, which is exactly
    what it had done to every text input in the app, the entry form included.
12. MUST convey required and invalid state to assistive technology, not only with an
    asterisk and a colour. An `aria-hidden` asterisk tells a screen reader nothing.
13. MUST NOT let an empty input become a number. `z.coerce.number()` turns `""` into
    `0`, which once saved a blank required yield as a real observation of zero.
14. MUST derive a plot layout only from the seed, the treatments, the replicate count
    and the site — and freeze all of them once a plot-keyed record exists. Changing
    any of them afterwards silently re-labels every record already taken.
15. MUST average readings that share an experimental unit before comparing treatments.
    Several samples in one plot are one observation, not several.
16. MUST NOT make the app fetch anything it needs in order to run. Typefaces are
    self-hosted and the shell is precached by `sw/service-worker.js`; a paddock has
    no signal, and a font or a script requested over the network is one that is not
    there when it matters.
17. MUST take colours from the named tokens in `src/index.css` — `ink`, `ink-soft`,
    `ink-faint`, `line`, `line-strong`, `paper`, `surface`, `sunk`. Never build a
    grey out of opacity (`ink/60`): it composites differently over every ground,
    compounds when nested, and cannot be contrast-checked because it is not a colour
    until it is painted.
18. MUST label an estimated observation window as estimated, every time it is shown.
    A window from a planting date and a typical day count, and one from a stage
    somebody confirmed, are different kinds of claim — and somebody deciding whether
    to drive an hour is entitled to know which they are looking at. Never present a
    guess in the same voice as a fact.
19. MUST NOT let a pulled row overwrite a local field the backend did not send.
    Absent means the column does not exist yet (a migration behind); null means
    somebody cleared it. `keepColumnsTheCloudLacks` in `services/store.ts` holds the
    line — without it, shipping a feature before its migration silently deletes data.
20. MUST NOT reach for a PDF library. The trial report prints through the browser,
    which every device already has: it costs the bundle nothing, embeds photos without
    re-encoding, and uses the reader's paper size. jsPDF is ~350 KB and pdfmake over a
    megabyte, against a whole bundle of ~780 KB that has to reach a paddock.
21. MUST give every form its own `eventType`, unique within the trial. Records carry
    the event type, not the template id — two forms sharing one look like the same
    visit to the due list, to "already recorded here", and to anybody reading the export.
22. MUST NOT let the test suite reach a real backend. Vitest loads .env through
    Vite, so a developer with .env.local present once had `npm test` writing junk
    rows into a live Supabase project on every run. `vite.config.ts` blanks the
    credentials for tests and `src/lib/testIsolation.test.ts` fails if that stops
    being true. Never work around it by re-supplying them.
23. MUST store weather and soil as typed columns, never as free text or a link alone.
    A link says a number is traceable; it cannot answer "rainfall between emergence and
    tuber initiation" or "pH at 0–10 cm across every trial on this soil". The data-source
    links stay as the relationship layer; `weather_observations`, `soil_samples` and
    `soil_results` are the data layer.
24. MUST keep a soil result's depth, unit and method with it. pH in water and pH in CaCl₂
    differ by roughly half a unit on the same sample, and a pH with no depth cannot be
    compared with anything. Separate the measured value from the interpreted label.
25. MUST NOT sum `rainfall_since_9am_mm`. BOM's rain trace is cumulative since 9am local,
    so adding the readings multiplies a day's rain by the number of observations in it.
    Take each rain day's maximum — `summariseWindow` in services/weatherImport does.
26. MUST let a new service worker activate itself. It used to wait to be asked, and
    the control that asks lives inside the app — so a release that stopped the app
    rendering could never be superseded, and recovering meant sending SKIP_WAITING
    by hand from a console. Waiting guards something recoverable; not waiting guards
    something that is not.
27. MUST NOT gate rendering on IndexedDB. `main.tsx` mounts whether or not seeding
    worked, and a database that will not open shows a plain-DOM message with a retry.
    An unsettled promise in that chain is a blank page with nothing in the console.
28. MUST offer the measurement library before a blank box when somebody adds something
    to record. Two trials that pick `marketableYield` in kg can be pooled next season;
    two that type "Yield" and "Marketable wt" never can, and nobody finds out until
    they try. Anything typed by hand is offered back to the next person.
29. MUST NOT store the shipped measurement list as rows. A pull removes local records
    the cloud does not have, so seeded built-ins vanish on first sync — that is what
    happened to the demo forms. Built-ins live in code; only additions are stored.
30. MUST keep the factorial arrangement separate from the field layout. A factorial
    says how treatments are *combined*; RCB, CRD and split-plot say how they are laid
    out. An interface that conflates them teaches people that choosing "factorial"
    replaced blocking, which it never did.
31. MUST treat a practice arm as the treatment combination itself. Everything keys on
    armId — the layout engine, the plot picker, the export, every recorded entry — so a
    parallel combinations table would be two rows for one thing and a synchronisation
    problem. Arms carry `factorLevels`.
32. MUST compute a factorial main effect by averaging the combination means, never
    every plot. They agree only while the design is balanced; the moment a plot is
    missing, averaging plots weights each combination by how much data it happened to
    return. See services/factorialAnalysis.ts.
33. MUST NOT add a `dark:` class for anything the tokens already flip. The palette
    swaps under `html.dark` in one block; a per-element override is how one colour
    gets left behind on the wrong ground.

## Database schema

See `docs/schema.md` for the full collection structure (written for Firestore; the
Postgres translation lives in `supabase/migrations/`, snake_case column names).
The schema is designed for multi-arm trials with a control-plus-alternatives pattern.
NEVER hardcode trial arms as A/B. Always use the PracticeArm collection.

## Coding conventions

- Use `interface` for object types, `type` for unions/intersections.
- Colocate tests as `*.test.ts` next to source files.
- Use `async/await` over `.then()` chains.
- Error handling: return Result types `{ success: boolean, data?: T, error?: string }`.
- Date handling: use `date-fns`, never `moment`.
- IDs: use client-generated UUIDs (crypto.randomUUID), never custom sequential IDs.

## What NOT to do

- NEVER use localStorage or sessionStorage (sandboxed iframes block it).
- NEVER add dependencies without checking bundle size impact.
- NEVER use default exports.
- NEVER skip Zod validation on user input.
- NEVER hardcode trial-specific field names in components. Use the FormTemplate config.
- NEVER expose internal schema structure to grower-facing forms.

## Grower-facing design principles

- Maximum 5 input fields per form screen.
- Use sliders and dropdowns over free-text input where possible.
- Every form must work offline and show sync status.
- Photo capture is a first-class input type, not an afterthought.
- Pre-fill site, trial, and arm context. Growers should never select these manually.
- Plain language only. No technical jargon in grower-facing UI.

## Brand

Follow the PotatoLink brand guidelines, not the placeholder palette in
`docs/PROMPT.md` (that teal was a stand-in before the guidelines were available).

- Colours are defined once as tokens in `src/index.css`. Use the token names
  (`primary`, `accent`, `paper`, `ink`, …), never raw hex in components.
- Primary is rich brown; gold/tan is the accent for keylines, panels, and
  highlights; backgrounds are warm cream, not neutral grey.
- `h1` renders bold uppercase — write headings in sentence case and let the
  stylesheet do it. `h2` deliberately does **not**: with uppercase on both, a trial
  page stacked fourteen all-caps headings, and uppercase destroys the word shape
  that makes a heading scannable. The authority the guidelines are after comes from
  one title being set that way and nothing else competing with it.
- Type comes from the scale, not from ad-hoc sizes: `text-eyebrow`, `text-meta`,
  `text-body`, `text-subtitle`, `text-title`, `text-display`. Each carries its own
  line height.
- Typefaces are Cabinet Grotesk (display) and Satoshi (body), self-hosted in
  `src/assets/fonts`. They were previously requested from Fontshare's CDN, which
  returned the wrong second family — so no heading in the app was ever set in
  Cabinet Grotesk until they were bundled.
- The logo mark is overlapping potato outlines; the header carries the
  "Australian Potato Industry Extension Project" descriptor.
