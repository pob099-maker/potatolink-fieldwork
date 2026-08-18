# Design note: supporting replicated ("proper") trials

Status: **design only.** The tidy-data export (below, "Increment 1") is built.
The replication structure ("Increment 2") is described here so it is a
considered decision, not something improvised later.

## Guiding principle: replication is opt-in per trial

The platform serves a spectrum of rigour, and a trial declares where it sits.
Replication features apply **only** to trials that opt in. A practice-change
or viability assessment is never forced to have blocks, reps, or a formal
response variable, and is never warned about "missing" reps it was never meant
to have. This mirrors the existing ethos — forms are config-driven templates,
practices are not hardcoded — applied one level up to the trial itself.

### Two trial modes

| | Practice-change / viability assessment | Replicated experiment |
|---|---|---|
| Examples | CropVision, HarvestEye | a future efficacy trial |
| Question | Does it fit? What does it cost? Is the output usable? | Is the difference statistically real? |
| Structure | practices, sites, forms, media, economics | + replicate/block, response variable, design |
| Rep requirement | none | ≥ N reps per treatment per site |
| Output | descriptive summary + economics + evidence | tidy dataset for biometric analysis |

Everything the app does today is the left column and stays exactly as it is.

## Increment 1 — tidy-data export (built)

`buildTrialCsv` produces a long-format CSV: one row per observation (metric),
across field records and staff records alike, with trial / site / practice /
form / event / metric columns and a media URL column. It drops straight into
R, GenStat, ASReml or Excel — CSV is the lingua franca, so "biometric app"
needs no per-tool connector. Available now from **Export data (CSV)** on any
trial page, replicated or not.

## Increment 2 — replication structure (planned)

Only surfaces for trials whose mode is "replicated experiment".

**Capture**
- Replicate/block as a structural dimension (like site and practice already
  are), so the app knows a treatment should appear N times per site.
- The trial declares its **design** (e.g. randomised complete block, N reps)
  and one or more **response variables** — the number(s) the difference is
  about, measured identically in every plot.
- Plot layout recorded: plot IDs mapped to treatment × block.

**Collate (quality gate before handoff)**
- Completeness and range checks scoped to replicated trials only: missing
  plots, missing response values, duplicate reps, out-of-range outliers. This
  is where the app beats a shared spreadsheet — structure enforced at capture.

**Export / report**
- The tidy CSV gains a `block`/`rep` column and a marked response variable.
- A **design + data-dictionary sheet** so the biometrician can choose a model.
- A human-readable **report pack** (means ± SE per treatment, n per treatment,
  site/weather/cost context, photos), labelled *descriptive summary; requires
  statistical analysis to confirm*. Doubles as the extension/field-day asset.

**What the app deliberately does NOT do**
- No ANOVA / LSD / mixed models in-app. Inference is handed to a biometrician
  or a proper tool. A naive statistic read by a non-statistician would hurt
  credibility more than help — and PotatoLink's brand leads with scientific
  accuracy and citing sources.

## Open questions for increment 2
- Where does "mode" live — a field on the trial, or a derived property?
- Is randomisation generated in-app or recorded from an external plan?
- Power/rep-count guidance at setup needs an expected variance the grower
  rarely has; keep it advisory, never a promise of significance.
