# Brief: design an example trial for Fieldwork

**For another AI agent. Self-contained — you do not have the codebase and do
not need it.**

Your job is to design one realistic agricultural trial and produce the files a
person will use to walk it through an app called Fieldwork, looking for places
the app breaks.

You are not testing your own output. Somebody will import what you produce,
click through the whole thing, and write down what goes wrong. Your job is to
give them something worth clicking through — realistic enough to be fair, and
awkward enough to be revealing.

---

## What Fieldwork is

A web app for running on-farm agricultural trials. Two audiences:

- **Staff** design a trial at a desk: what is being compared, which paddocks,
  what gets recorded, and when.
- **Growers and contractors** record observations in a paddock, on a phone,
  usually with no mobile reception. They tap a link, fill in a short form, and
  it syncs when signal returns.

It is crop-neutral. Potatoes are the first use, but nothing in it is potato-
specific and it must work for irrigation, mechanisation or haulm-destruction
trials too.

### What it can do

- **Two designs.** *Observational* — a demonstration comparing two or more
  practices, no statistics. *Replicated* — randomised plots, a nominated
  response variable, treatment means with standard errors.
- **Control plus alternatives.** Every trial has exactly one control and one or
  more alternatives. Never "A vs B".
- **Multiple sites.** Each paddock gets its own randomised layout and its own
  planting date.
- **Multiple forms per trial.** A form is a *visit* — an emergence count, a
  mid-season disease score and a harvest weight are three forms, not one.
- **Factorial designs.** Two or more factors crossed, with main effects and
  interactions. Set up in the app, not in the import file.
- **Scheduling.** A form can be expected at a growth stage; the app estimates
  the window from the planting date and lists what is due.
- **Photos, videos, files and links** as field types.
- **Weather and soil** stored as typed columns, imported separately.
- **Exports.** A full long-format CSV of every record, and a per-treatment
  summary for costing elsewhere.
- **A printable trial report.**

### What it deliberately does not do

- No economics or costing. It exports results; something else prices them.
- No statistical significance tests. Means and standard errors only.

---

## Deliverable 1 — the trial as an importable CSV

This is the main artefact. Get the format exactly right or it will not import.

### Rules of the file

- Comma-separated. First line must be exactly `# fieldwork-template v1`.
- Then setting rows, in any order, one per line.
- Then one `form` header row, then one line per field.
- Quote any cell containing a comma.

### Setting rows

| Row | Columns after the key | Notes |
|---|---|---|
| `trial` | name | Required. |
| `objective` | what it sets out to show | |
| `design` | `observational` or `replicated` | Defaults to observational. |
| `replicates` | a number | Replicated needs **2 or more**. |
| `site` | location, region, soil type | One row per paddock. |
| `practice` | name, `control` or `alternative`, description | Exactly **one** control. |

Anything else in the first column is an error, so do not invent settings.

### The form header row

Copy this line verbatim:

```
form,event_type,audience,frequency,requires_site,requires_arm,label,field_name,type,required,unit,min,max,options,response,help
```

### Field rows

One line per field. First column is the **form name**, repeated on every field
belonging to that form.

- `event_type` — a machine name, unique per form (`harvest`, `emergence`). Two
  forms sharing one is an error.
- `audience` — `grower` or `staff`.
- `frequency` — free text (`Each run`, `Once per plot`).
- `requires_site` / `requires_arm` — `yes` or `no`. A response variable must be
  on a form with `requires_arm,yes`.
- `label` — the question a person reads. Plain language, no jargon.
- `field_name` — leave blank; it is generated.
- `type` — one of: `number`, `text`, `select`, `multiselect`, `slider`,
  `boolean`, `date`, `photo`, `video`, `file`, `link`, `gps`.
- `required` — `yes` or `no`.
- `unit` — see below. Numbers only.
- `min` / `max` — numbers. A slider is usually 1 to 5.
- `options` — for `select` and `multiselect`, separated by ` | `. Required for
  those types.
- `response` — `yes` on **exactly one** number field for a replicated trial.
  Leave blank everywhere else.
- `help` — a note shown under the question in the paddock. Use it where a label
  cannot carry the detail: "weigh before grading", "count the middle two rows".

### Units that unlock behaviour

Type these exactly:

- `kg` or `t` — with a plot size, the app computes tonnes per hectare.
- `t/ha` or `kg/ha` — already a rate, carried straight into the costing export.
- `m2` or `ha` — lets a record carry its own plot area.
- Also available: `g`, `count`, `%`, `plants/m2`, `mm`, `cm`, `m`, `days`,
  `hours`, `°C`, `pH`, `$`, `$/t`. Anything else is accepted as free text.

### What will be rejected

Do not produce a file that trips these — a rejected import teaches nothing:

- No trial name
- Replicated with fewer than 2 replicates
- Zero or two-plus practices marked `control`
- Two practices, two sites, or two forms' event types with the same name
- A form with no fields
- A `select` with no options
- `min` greater than `max`
- A replicated trial with no `response`, or more than one
- A `response` field that is not a number, or on a form with `requires_arm,no`

### Where it will warn but still import

These are fine and worth including deliberately — the person walking it through
should see the warnings:

- More than two free-text fields on one form
- More than 15 fields on one form
- No grower-facing form at all
- A response marked on an observational trial

---

## Deliverable 2 — a walkthrough script

The CSV cannot express everything. Write a numbered script for the person
driving, covering what they set up **in the app afterwards**:

- **Plot size** — length and width in metres, per trial. Without it there is no
  tonnes-per-hectare conversion.
- **Planting date** — per site. Everything scheduled hangs off it.
- **A schedule** — which growth stage each form is expected at. Choose from:
  `emergence`, `tuberInitiation`, `canopyClosure`, `bulking`, `senescence`,
  `desiccation`, `harvest`.
- **Factors and levels**, if your design is factorial.
- **Who is involved** — people on the trial.

Say what they should *expect to see* at each step, so a wrong answer is
recognisable. "The due list should now show the emergence count as estimated,
about three weeks after planting" is useful. "Check it works" is not.

---

## Deliverable 3 — dummy observations

A table of records for somebody to type in, or paste as a second CSV. Enough to
make the results page and the exports meaningful.

**Make the numbers behave like real ones.** A treatment effect that is obvious
in every plot is not a test of anything. Include:

- Plot-to-plot variation that overlaps between treatments
- At least one **missing** plot — somebody did not get to it
- At least one value that is legitimate but extreme
- Values that are plausible for the crop and the unit

State what the right answer is — what the treatment means should come out as —
so a wrong figure on screen is recognisable as wrong.

---

## Design it to find breakages

A trial that only exercises the easy path proves nothing. Build in **at least
four** of these:

- Two or more sites, with different planting dates
- Three or more practices, not two
- Three or more forms with different schedules
- A factorial design near the guardrails: the app notes above 8 plots per
  block, warns above 16, refuses above 24; and notes above 24 total plots,
  warns above 48, refuses above 96. Sit deliberately close to a threshold.
- Every field type at least once across the trial, `link` and `file` included
- Names containing commas, apostrophes, accented characters or `&` — these must
  survive the CSV round trip
- A very long label or option list
- A measurement whose unit is not in the list
- A form with no schedule at all, alongside ones that have them
- One form for staff, not growers

Note which of these you chose and what you expect each to reveal.

---

## Constraints

- **Invent nothing real.** No real farm names, real people, or real contact
  details. Made-up but plausible.
- **Plain language in anything a grower reads.** No jargon in a label.
- **Australian context** — regions, seasons, units. Metric throughout.
- **Do not describe the app back to the reader.** They have it open.

---

## Output

Four things, clearly separated:

1. **A short design rationale** — the trial in a paragraph, and which
   breakage-hunting features you built in and why.
2. **The CSV**, in a code block, ready to save and import.
3. **The walkthrough script**, numbered, with expected results.
4. **The dummy observations**, with the answers they should produce.
