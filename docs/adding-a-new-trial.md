# Adding a new trial

A new trial never needs code changes — only configuration. This is how the
HarvestEye trial was added (see `harvesteye_trial_protocol.csv` → PR #7), and
the process to repeat for any future trial (VRI, haulm destruction, irrigation…).

## 1. Fill in the protocol template

Copy `trial-protocol-template.csv` and fill one row per data point. The
**Trial Setup** rows define the trial itself; the **Field Record** rows become
the grower-facing entry form (replace the EXAMPLE rows).

## 2. Choose a field type for every data point

| Type | Use for | Notes |
|---|---|---|
| `number` | Anything measured or counted | Set unit, min/max where sensible |
| `select` | A known list of outcomes, pick one | Always prefer over free text |
| `multiselect` | Pick all that apply | Tap-chips — e.g. every defect seen |
| `slider` | Ratings and gut-feel scores | 1–5 works best |
| `boolean` | Yes/no questions | Rendered as two big buttons |
| `date` | A date other than the entry date | Entry date is captured automatically |
| `photo` | Visual evidence | Max 20 MB, uploads on sync |
| `video` | Demos, moving equipment | Max 100 MB (~1 min), uploads on sync |
| `file` | System exports, PDFs, spreadsheets | Max 25 MB, uploads on sync |
| `gps` | Where an observation happened | One tap captures phone coordinates |
| `text` | Only when nothing above fits | Keep to one "notes" field at the end |

## 3. Split the protocol into forms, not one form

A trial usually needs several forms, because protocol stages differ in who
fills them in and how often. The HarvestEye trial is the worked example: one
grower form for the per-pass harvest run, plus staff forms for site setup,
calibration, install/removal, daily weather, portal output, observer feedback
and the cost log.

Each form declares:

- **Audience** — `grower` (frictionless, reached by an entry link) or `staff`
- **Frequency** — plain language, shown to whoever fills it in ("Daily during the trial")
- **Requires site / requires arm** — a harvest run belongs to a site *and* a
  practice; weather belongs to a site only; a cost log belongs to the trial

Forms appear under "Trial forms" on the trial page, each with Fill in and Edit.

## 4. Rules for grower-facing fields

- Plain language questions, no jargon — "How long did the run take?" not "Duration (h)".
- Prefer select/slider/boolean over free text; every extra typed field costs completion rate.
- Mark a field required only if an entry is useless without it.
- The app shows at most 4 fields per screen automatically; ~12 fields (3 screens) is a comfortable ceiling.
- Site and arm are pre-filled from the entry link — never make growers choose them.
- Staff-side data (calibration logs, cost logs, observer feedback) stays out of the
  grower form; it becomes separate templates when per-eventType templates land.

## 5. Or skip the developer entirely: CSV import

Dashboard -> **Import CSV** accepts a Fieldwork Template CSV (reference file:
`fieldwork-template-v1.csv` in this folder) and creates the whole trial —
forms, screens, validation — in one step. Errors block creation; warnings ask
for a confirm. Mark one numeric field `response,yes` and set
`design,replicated` to import a replicated trial ready for the completeness
grid.

## 6. Turn the protocol into configuration (developer path)

Hand the filled CSV to the developer/Claude. The change is:

1. New entries in `src/services/seed.ts` (trial, sites, contacts, arms, template) with fixed UUIDs, and a seed version bump.
2. Matching inserts in `supabase/seed.sql` (or run once in the Supabase SQL editor).
3. A PR — CI proves nothing else changed.

Entry links to hand to growers look like:

```
/trials/<trialId>/entry?site=<siteId>&arm=<armId>
```

One link per site/arm combination, plus the shared access code.
