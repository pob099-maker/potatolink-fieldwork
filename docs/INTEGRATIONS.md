# Connecting Fieldwork to other systems

What it would take to pull data from sensor networks, machinery or farm
management software — and what has to be settled before any of it can be built.

This is the developer-facing record. The version to hand colleagues is the
integrations brief; both say the same thing, this one in more detail.

---

## What the app already does, unaided

Worth stating first, because two of these get proposed as integrations when
they are already in the app.

**Weight becomes yield.** A trial records its plot size, and any numeric field
measured in `kg` or `t` shows tonnes per hectare as it is typed. The export
carries `yield_t_ha` and `plot_area_m2`. Nobody needs a yield monitor to stop
doing that arithmetic in a paddock.

**A strip's area can be measured by walking it.** Mark one end, drive to the
other, mark again; the width comes from the machine, already recorded on the
trial. An 800 m run at 12 m is accurate to about 1%, and a fix too rough to
trust is discarded rather than written to the file.

**A record can carry its own area.** Strips across an irregular field or a
pivot circle are different lengths, so a per-record area in `ha` or `m²`
overrides the trial's plot size.

**Provenance is recorded.** A trial lists its data sources — a SensorThings
datastream, an ISOXML export, a protocol — scoped to a plot, a treatment, a
site or the trial. Every exported row names the sources covering it. Nothing
is fetched; this is the record of *where to look*, and it is the groundwork
every option below starts from.

---

## The three candidates

### OGC SensorThings — soil moisture, weather, anything on a datastream

**What it gives you.** Continuous site conditions alongside manual
observations: soil moisture, temperature, rainfall. For irrigation and VRI
work this is the covariate the trial is actually about.

**Approach.** Pull a **daily summary**, not the raw stream. Fetch a bounded
window (`$filter=phenomenonTime ge …`), aggregate client-side, and write one
event per site per day. A day of five-minute readings is under 300 points and
the summary is a handful of numbers.

**It fits the existing model exactly.** The app already has the concept of a
staff form scoped to a site rather than a practice — the reference template
literally contains a *"Daily weather"* form. This is that form with a
different author.

**Prerequisites**
- A live endpoint to test against. The spec is public; a working server is not.
- A Supabase Edge Function if the endpoint needs a key. `VITE_` variables are
  compiled into the bundle and readable by anyone, so a credential cannot live
  in the client.

**Does *not* need plot geometry.** Earlier notes said otherwise; that was wrong
and applied only to yield maps.

**Effort:** moderate. **Risk:** low, once there is something to point at.

### ISOBUS / ISOXML — machinery exports

**What it gives you.** As-applied and as-harvested data from the terminal. For
strip trials this is the highest-value data in the system, because the
harvester already measures what somebody is otherwise capturing by hand.

**Approach.** Read **task totals**, not the point cloud. `TASKDATA.XML` carries
`TIM`/`DLV` elements with total mass and total area per task. If each strip is
run as a task, that is weight and area per strip — which lands straight in the
per-record area field the app already has, and converts to t/ha with no
geometry at all.

**Prerequisites**
- A real `TASKDATA.XML` from a terminal actually in use. Not negotiable.
- Agreement on whether strips are run as separate tasks. If they are not, the
  totals describe the whole paddock and the approach collapses back to the
  point cloud.

**The risk is variance, not difficulty.** Terminals differ in what they
populate, and variable-rate irrigation systems are reportedly among the worst
for this. A parser written against the specification alone will meet files it
cannot read, and will look finished while doing so.

**Effort:** substantial. **Risk:** high without sample files.

### Yield maps and prescriptions — the expensive version

**What it gives you.** Per-plot yield from a harvester point cloud, and
as-applied rates per zone.

**Prerequisite: plot boundaries, which the app does not have.** Sites carry a
single `coordinates` point — null on every row, with no way to enter one — and
there is no polygon anywhere in the model. Turning a point cloud into "plot 7
yielded 46.2 t/ha" needs plot *shapes*.

**Effort:** large. **Recommendation:** not until something above has proved
useful.

---

## What decides this

None of it can be scoped without answers to these. They are questions for the
people who own the equipment, not for the app.

1. **Which specific systems?** Make and model of the probe, the terminal, the
   farm management software. "A soil probe" is not enough to build against.
2. **Who owns the data, and can they grant access?** An endpoint, an account,
   or an export somebody emails once a week are three different projects.
3. **Is there a live endpoint, or only manual exports?** This decides whether
   anything can be automatic at all.
4. **What granularity is actually needed?** Per plot, per site, per day. Asking
   for the finest is expensive and usually not what the analysis uses.
5. **Who maintains it?** An integration is not finished when it works; it
   breaks when a vendor changes an endpoint, and somebody has to notice.

---

## Constraints that apply to all of them

- **No credentials in the client.** Every `VITE_` value ships inside the
  JavaScript. Anything authenticated needs a server-side function, which is new
  infrastructure and ongoing cost.
- **Nothing is verifiable without real data.** Both candidates can be written
  against their specifications and neither is *tested* until pointed at a live
  endpoint or a genuine export file. Code that looks finished and has never met
  real data is the specific risk here.
- **The local store is a phone.** Anything ingested syncs to every device, so
  summaries belong in the app and raw streams do not.
- **The app is open until lock-down.** See [GO-LIVE.md](GO-LIVE.md). Connecting
  a real data source is a reason to finish that first, not after.

---

## Recommended order

1. **Answer the five questions above.** Nothing else is scopeable first.
2. **SensorThings daily summary** — smallest, lowest risk, fits the model, and
   the covariate most trials actually want.
3. **ISOXML task totals** — only with sample files in hand from the machines in
   use.
4. **Plot boundaries and yield maps** — only if the first two have earned it.
