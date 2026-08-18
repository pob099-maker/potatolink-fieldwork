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
| `select` | A known list of outcomes | Always prefer over free text |
| `slider` | Ratings and gut-feel scores | 1–5 works best |
| `boolean` | Yes/no questions | Rendered as two big buttons |
| `date` | A date other than the entry date | Entry date is captured automatically |
| `photo` | Visual evidence | Max 20 MB, uploads on sync |
| `video` | Demos, moving equipment | Max 100 MB (~1 min), uploads on sync |
| `text` | Only when nothing above fits | Keep to one "notes" field at the end |

## 3. Rules for grower-facing fields

- Plain language questions, no jargon — "How long did the run take?" not "Duration (h)".
- Prefer select/slider/boolean over free text; every extra typed field costs completion rate.
- Mark a field required only if an entry is useless without it.
- The app shows at most 4 fields per screen automatically; ~12 fields (3 screens) is a comfortable ceiling.
- Site and arm are pre-filled from the entry link — never make growers choose them.
- Staff-side data (calibration logs, cost logs, observer feedback) stays out of the
  grower form; it becomes separate templates when per-eventType templates land.

## 4. Turn the protocol into configuration

Hand the filled CSV to the developer/Claude. The change is:

1. New entries in `src/services/seed.ts` (trial, sites, contacts, arms, template) with fixed UUIDs, and a seed version bump.
2. Matching inserts in `supabase/seed.sql` (or run once in the Supabase SQL editor).
3. A PR — CI proves nothing else changed.

Entry links to hand to growers look like:

```
/trials/<trialId>/entry?site=<siteId>&arm=<armId>
```

One link per site/arm combination, plus the shared access code.
