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
├── lib/              # Firebase config, utilities, helpers
├── types/            # TypeScript interfaces and types
├── schemas/          # Zod validation schemas
├── services/         # Firestore CRUD operations
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
