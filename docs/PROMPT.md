# Claude Code Prompt — Build PotatoLink Fieldwork MVP

## Context

You are building the first stage of PotatoLink Fieldwork, an agricultural trial data collection
and economics platform. The first use case is the Downs CropVision optical sorter trial comparing
existing post-harvest handling practices against optical sorter practices across sites in
Walkers Flat (South Australia) and Tasmania.

The platform must be reusable for future PotatoLink projects including VRI, haulm destruction
alternatives, and mechanisation trials.

## What to build in this session

Build the following in order. Complete each step before moving to the next.

### Step 1: Project setup
- Initialise a Vite + React 18 + TypeScript project with strict mode
- Configure Tailwind CSS v4
- Set up Firebase project (Firestore, Auth, Storage, Hosting)
- Create the folder structure defined in CLAUDE.md
- Set up React Router with these routes:
  - `/` — Dashboard (staff view)
  - `/trials` — Trial list
  - `/trials/:trialId` — Trial detail
  - `/trials/:trialId/entry` — Grower data entry form
  - `/trials/:trialId/results` — Results and economics view
  - `/settings` — App settings

### Step 2: TypeScript types and Zod schemas
- Create all TypeScript interfaces in `src/types/` matching the schema in `docs/schema.md`
- Create Zod validation schemas in `src/schemas/` for every collection
- Create a `Result<T>` type for error handling

### Step 3: Firebase service layer
- Create Firestore CRUD service functions in `src/services/` for each collection
- Include proper error handling with Result types
- Include offline persistence configuration
- Create Firestore security rules file

### Step 4: Seed data
Create a seed script that populates:
- 1 project: "Potato Mechanisation Program"
- 1 trial: "Downs CropVision Post-Harvest Handling Comparison"
- 2 sites: Walkers Flat SA, Tasmania
- 4 practice arms:
  - Control: "Existing post-harvest handling"
  - Alternative 1: "CropVision — on-farm owned unit"
  - Alternative 2: "CropVision — shared/service model"
  - Alternative 3: "Improved handling without optical sorter"
- 2 contacts: 1 grower, 1 staff member
- 1 form template for the CropVision trial with these fields:
  - tonnesHandled (number, required, unit: "t")
  - runDuration (number, required, unit: "hours")
  - peopleInvolved (number, required)
  - runWentAsPlanned (boolean, required)
  - photo (photo, optional)
  - sortingResult (slider, 1-5, optional)
  - mainRemovalCategory (select, options: ["clods/stones", "damaged tubers", "rot", "green potatoes", "misshapes", "foreign material", "no meaningful separation"], optional)
  - notes (text, optional)

### Step 5: Grower-facing data entry form
Build the mobile-first data entry form at `/trials/:trialId/entry`:
- Show only the fields defined in the FormTemplate for the selected arm
- Use React Hook Form with Zod validation
- Include photo capture using device camera
- Save entries locally when offline, sync when online
- Show sync status indicator
- Maximum 5 fields visible per screen — use progressive disclosure
- Large touch targets (minimum 44px)
- Plain language labels, no technical jargon
- Pre-fill site and arm context from the trial configuration

### Step 6: Staff dashboard
Build the staff dashboard at `/`:
- List all trials with status, site count, and entry count
- Show recent entries across all trials
- Show sync status summary (pending, synced, error)
- Quick link to create new trial

### Step 7: Trial detail page
Build the trial detail page at `/trials/:trialId`:
- Show trial metadata (name, objective, status, sites, arms)
- List all measurement events grouped by arm
- Show summary metrics per arm (total tonnes, average throughput, entry count)
- Link to grower entry form and results view

## What NOT to build in this session

- Do NOT build the economics calculation engine yet
- Do NOT build the results/scenario comparison view yet
- Do NOT build user authentication (use a simple access code for now)
- Do NOT build the adoption follow-up module yet
- Do NOT build the CRM integration yet
- Do NOT build the form template builder UI yet

## Design requirements

- Mobile-first: design at 375px, expand to desktop
- Use Tailwind CSS v4 with a custom colour palette:
  - Primary: teal (#01696f)
  - Background: warm neutral (#f7f6f2)
  - Text: dark warm gray (#28251d)
  - Success: green (#437a22)
  - Warning: amber (#d19900)
  - Error: red (#a13544)
- Use Satoshi font from Fontshare for body text
- Use Cabinet Grotesk from Fontshare for headings
- Minimum touch target: 44x44px
- Support both light and dark mode with a toggle
- Include loading skeletons for all data-fetching states
- Include empty states with clear calls to action
- Include error states with retry options

## Verification checklist

Before considering the build complete, verify:
- [ ] `npm run typecheck` passes with zero errors
- [ ] `npm run lint` passes with zero errors
- [ ] `npm run build` succeeds
- [ ] App renders correctly at 375px viewport
- [ ] App renders correctly at 1280px viewport
- [ ] Dark mode toggle works
- [ ] All forms validate with Zod before submission
- [ ] Offline entry saves locally and shows sync status
- [ ] Photo capture works on mobile viewport
- [ ] Seed data loads correctly
- [ ] All routes are accessible
- [ ] No console errors or warnings
