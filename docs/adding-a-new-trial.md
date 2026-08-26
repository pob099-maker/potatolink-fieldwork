# Setting up a trial

A worked example, start to finish, using a real trial built in the app: **four
irrigation schedules compared under a pivot, three blocks, two sites**. It takes
about ten minutes.

Nothing here needs a developer. Adding a trial has not needed a code change
since the setup wizard landed.

The button-pressing is the easy half. What is worth understanding is *why* the
app asks what it asks, so this explains the decisions rather than the clicks.

---

## 1. Say what kind of trial it is

**New trial → Answer a few questions.**

The first question decides everything after it, so it is worth getting right.

**"Comparing ways of doing something"** — a demonstration or on-farm
comparison. Record what happens under each, show a neighbour the difference.
No replication, no statistics, and the app will call them *practices*.

**"A designed experiment"** — replicated plots in a randomised layout, so the
result can be analysed properly. The app calls them *treatments*, generates the
layout, and produces a fieldbook.

Choosing the experiment asks one more thing: **how many blocks?**

### What a block is, and why it is the default

A block is a group of plots that holds one of every treatment. The field is
divided into blocks, and the treatments are shuffled *within* each block
separately.

The point is to absorb a gradient. Paddocks are not uniform — there is a slope,
a drainage line, a change in soil. If the ground gets wetter towards one end and
your treatments happen to be laid out in the same direction, you cannot tell the
treatment apart from the wetness. Blocking puts every treatment in every part of
the field, so the gradient affects all of them equally and drops out of the
comparison.

Three or four blocks is usual. Two is the minimum that lets you estimate
variation at all.

## 2. Name what is being compared

A trial name, what you hope to find out, then the control and the alternatives.

> **Deficit irrigation timing under pivot**
> *Does withholding water at one growth stage cost less yield than a full schedule?*
>
> Control: **Full schedule**
> Alternatives: **Deficit at tuber initiation**, **Deficit at bulking**, **Deficit late**

The control is what everything else is measured against — what is being done
now. Every trial keeps exactly one.

The objective is optional and worth writing anyway. It is what the trial gets
judged against a year later, when nobody remembers what the question was.

## 3. Say where it runs

One site to start with; more can be added on the trial page afterwards.

**Each site gets its own randomised layout.** Two sites are two separate pieces
of ground, and giving them one arrangement would put the same treatment in the
same relative position at both — so anything the two paddocks share gets
confounded identically at each, which is the opposite of what blocking is for.
One stored seed still reproduces all of them.

## 4. Decide what gets recorded

Start from the three offered, then rename, retype, add and remove. A trial
measuring tuber counts or a disease score says so here rather than settling for
the nearest offered word.

Two things to get right:

**Ask for what can be measured, not what you want to know.** A form asking for
"yield (t/ha)" asks somebody standing in a paddock to convert kilograms off a
plot. Nothing checks that sum, and a misplaced decimal is invisible for the rest
of the trial. Ask for the **weight in kg** and let the app do the conversion —
see step 6.

**Nominate the response variable.** A replicated trial asks outright which
number it is comparing. Only a number can be nominated, because there is no mean
of a photograph. Get this wrong and the whole statistical summary points at the
wrong column, quietly.

Then **Create the trial**. It lands on the trial page, ready to record.

---

## 5. Add the second site

**Sites → add.** It joins the layout with its own independent arrangement.

## 6. Record the plot size

**Trial design → Plot size.** For this trial, 4 m × 15 m = 60 m².

This is what turns a weight into a yield. With a size recorded, a field
measured in `kg` or `t` shows tonnes per hectare *as it is typed* —
120 kg off 60 m² reads `≈ 20.0 t/ha` under the box. The export carries both.

The point is not convenience. It turns a silent arithmetic error into an
obviously wrong number on screen.

**Typed, not measured by satellite.** A trial plot is a few tens of square
metres and a phone fixes a corner to within several metres, so a walked boundary
would carry more error than the plot has area. That trade reverses at strip
scale — a hectare-scale strip can be measured by walking its length, because the
width is the machine's and is already known. Strips of unequal length carry
their own area on the form instead.

## 7. Generate the layout

**Plot layout → Generate the layout.**

For this trial: **24 plots across 2 sites**, 6 blocks, every block holding all
four treatments exactly once, and a seed like `0YFHEXV`.

**Keep the seed with the trial records.** It regenerates every site's
arrangement exactly, which is how anyone else can check the randomisation was
real. A layout nobody can reproduce is a layout nobody can verify.

**Download the fieldbook** for a printable CSV — one row per plot, in walking
order, with the site named on every row.

The layout **freezes** once anything has been recorded against a plot. So do the
arranging before the trial goes in, not after: changing the treatments, the
block count or the arrangement afterwards would silently re-label every record
already taken.

---

## 8. Hand out the links

**Collecting observations → Show the links for recording in the field.**

One link per site. The links carry the access code, so whoever you send one to
taps it and starts recording. Treat a link like the code itself — anyone who has
it can add entries.

Whoever is recording sees **Which plot?** — the numbers grouped by block, with
the treatment shown for confirmation. They tap the number on the peg; the
practice and the replicate are looked up rather than asked for. Asking somebody
standing in plot 7 which treatment they are looking at is a question they may
not be able to answer and an invitation to guess.

The form works with no signal and says so. Entries save to the device and go up
when a connection returns.

### Say this when you send the link

**Open it once where there is signal, then add it to the home screen** — the
Share menu on an iPhone, the ⋮ menu on Android.

That first visit is what puts the app on the phone: the code, the styling and
the typefaces are all stored on the device, so it opens out of range instead of
depending on the link still being findable and the network still being there.
After that it is an icon next to the camera rather than a message somebody has
to scroll back to.

Worth doing before anybody drives out. A phone that has never opened the link
has nothing to fall back on, and the paddock is the wrong place to discover it.

---

## 9. Read the results honestly

**Replication status** shows which plots are still outstanding, named by the
plot number to walk to rather than by replicate.

**Response summary** gives descriptive means and standard errors per treatment.
It is not a significance test, and the app will not pretend otherwise — export
the tidy data and analyse it properly.

### Why n may be smaller than the number of entries

If you take several readings in one plot — points down a strip, or the same plot
assessed twice — they are **averaged within the plot** before the treatments are
compared.

Randomisation was applied to plots, so a plot is one independent observation
however many times the clipboard was filled in. Counting each reading separately
would understate the standard error by roughly the square root of the number of
samples, and the app would be showing a confidence nobody earned.

The summary says so when it happens, and **n** reads like `2 (3 readings)`.

## 10. Say when observations are due

**Planting and growth stages**, on the trial page. Enter the **planting date**
for each site. Then, on each form under **Trial forms**, set *When is this
wanted?* — "at tuber initiation", "at harvest", or a set number of days after
planting.

### Why it asks for a stage and not a date

Because your protocol does. Nobody writes "assess on 14 October"; they write
"at tuber initiation", because that is when the thing being measured is
happening. A date fixed at setup is wrong the first time a season runs late,
and every week after that it is wronger — and a schedule that is wrong is worse
than no schedule, because people learn to ignore it.

So the app works from what it actually knows:

- **The planting date** is the anchor. It is the one date on a trial that
  somebody always knows exactly. Per site, because two sites planted a
  fortnight apart are two schedules.
- **A typical day count** turns that into an estimated window — tuber
  initiation is usually 35 to 45 days after planting. This is a guess, and the
  app labels it *estimated* everywhere it appears.
- **A confirmed stage** replaces the guess. When somebody standing in the crop
  says the stage has arrived, choose it under *Confirm a stage has arrived* and
  every window hanging off it re-anchors to the real date — and stops being
  called an estimate.

That last step is what stops the schedule decaying. Do it as you go.

### The reminder

**Add to calendar** downloads a `.ics` file. Open it on the phone that does the
recording and the observations land in its own calendar, with an alarm the day
before.

This is the reminder, and it is worth being straight about why: Fieldwork has
no server. Nothing runs on a schedule, so the app cannot send you anything. The
phone's calendar can, it is already checked every morning, and it needs no
account and no permission from us.

The file is a snapshot. Confirm a stage — which moves the dates — and download
it again.

### What you will see

The dashboard shows a banner for anything **due now** or **late**, with a
Record button that opens the right form at the right site. Nothing upcoming
appears there: a banner that is always on is furniture, not a warning.

## 11. Record where the data came from

**Where the data comes from** — a sensor datastream, a machinery export, the
written protocol. Scoped to a plot, a treatment, a site or the whole trial.

Nothing is fetched or parsed; these are recorded so a number can be traced.
Every exported row names the sources covering it. Under variable-rate irrigation
a flow meter belongs to one plot, because the point of the machine is that each
zone gets its own rate.

## 12. Add a form for each visit

**Trial forms → + Add a form.**

The trial starts with one form. Most protocols need more than one, because an
emergence count, a mid-season disease score and a harvest weight are three
different visits asking three different things. Cramming them into one form
means whoever is standing in the crop at emergence scrolls past harvest
ones to reach the two that apply.

Name the form after the *visit*, not the trial — it is what somebody picks from
a list in a paddock. Each form gets its own timing, so "at emergence" and "at
harvest" can both be scheduled on the same trial.

## 13. Print the report

**Trial report**, on the trial page. It pulls together the design, the sites,
the mean per treatment, the variation between blocks, what is still outstanding
by plot number, and a photo log captioned with the plot each picture came from.

**Print / Save as PDF** goes through your browser's own print dialog — choose
*Save as PDF* as the destination. There is no upload, so it works with no
signal.

It is descriptive. There is no significance test in it and the last paragraph
says so, because the report is the thing most likely to be read by somebody who
was not there when the trial was designed.

## 14. Export

**Export data (CSV)** — long format, one row per recorded value, with the plot,
the treatment, the derived `yield_t_ha`, the `plot_area_m2` it used, and the
data sources covering that row.

## 15. Close it when it is done

**Stage**, on the trial page.

- **Collection finished** stops new entries and changes nothing else. This is
  the state to analyse and write up in.
- **Archived** takes it out of the lists. It stays fully readable — results,
  economics and export all keep working — and comes back with one tap from
  *Show archived* on the Trials page.

Nothing is ever deleted by either.

---

## The other way in: a spreadsheet

If the protocol already lives in a spreadsheet, or the trial records more
than you would want to type one at a time, **New trial → Import a template**
takes the whole trial in one file: sites, practices and one row per thing recorded.
It is checked and previewed before anything is created.

The field types available are the same either way:

| Type | Use for | Notes |
|---|---|---|
| `number` | Anything measured or counted | Set the unit; `kg` or `t` unlocks the yield conversion |
| `select` | A known list of outcomes, pick one | Always prefer over free text |
| `multiselect` | Pick all that apply | Tap-chips — e.g. every defect seen |
| `slider` | Ratings and gut-feel scores | 1–5 works best |
| `boolean` | Yes/no questions | Two big buttons |
| `date` | A date other than the entry date | Entry date is captured automatically |
| `photo` | Visual evidence | Uploads on sync |
| `video` | Demos, moving equipment | Keep under about a minute |
| `file` | System exports, PDFs, spreadsheets | Uploads on sync |
| `gps` | Where an observation happened | One tap |
| `text` | Only when nothing above fits | Keep to one notes field, last |

## Rules for what a grower records

- Plain language, no jargon — "How long did the run take?" not "Duration (h)".
- Prefer select, slider and boolean over free text. Every typed field costs
  completion.
- Mark a field required only if the entry is useless without it.
- At most four things a screen; about twelve is a comfortable ceiling.
- Never make somebody choose the site or the practice — the link and the layout
  already know.
- Keep the catch-all notes field last. A free-text box above a specific one
  gets used instead of it.
