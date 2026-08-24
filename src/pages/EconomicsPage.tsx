import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ASSUMPTION_UNITS,
  blendComparisons,
  buildResultSets,
  compareArms,
  assumptionConfidence,
  DEFAULT_SCENARIO,
  formatMoney,
  parseScenarioAssumptions,
  scenarioForSite,
  type ScenarioAssumptions,
} from "../services/economics";
import { removeAssumption, saveAssumption, saveResults, saveScenario } from "../services/store";
import { metricNumber } from "../services/metricValue";
import { newId, nowIso } from "../lib/id";
import {
  useArms,
  useAssumptions,
  useEvents,
  useMetrics,
  useScenarios,
  useSites,
  useTrials,
} from "../hooks/useCollections";
import { words } from "../services/vocabulary";
import { Card, EmptyState, ErrorState, PageTitle, Skeleton, StatusPill } from "../components/ui";
import type { ArmAssumption, AssumptionCategory, Metric, PracticeArm } from "../types";

const inputClass =
  "w-full min-h-11 rounded-lg border border-ink/20 bg-surface px-3 py-2 " +
  "focus:border-primary focus:outline-none dark:border-ink-dark/20 dark:bg-surface-dark";

export function EconomicsPage() {
  const { trialId } = useParams<{ trialId: string }>();
  const trials = useTrials();
  const arms = useArms();
  const sites = useSites();
  const assumptions = useAssumptions();
  const scenarios = useScenarios();
  const events = useEvents();
  const metrics = useMetrics();

  const trial = trials.data?.find((candidate) => candidate.trialId === trialId);
  const word = words(trial ?? { vocabulary: null, design: "observational" });
  const trialArms = useMemo(
    () =>
      (arms.data ?? [])
        .filter((arm) => arm.trialId === trialId && !arm.archived)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [arms.data, trialId],
  );
  const armIds = useMemo(() => new Set(trialArms.map((arm) => arm.armId)), [trialArms]);
  const trialAssumptions = useMemo(
    () => (assumptions.data ?? []).filter((assumption) => armIds.has(assumption.armId)),
    [assumptions.data, armIds],
  );
  const trialSites = useMemo(
    () => (sites.data ?? []).filter((site) => site.trialId === trialId),
    [sites.data, trialId],
  );

  // null = every site blended into one trial-level view.
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [draft, setDraft] = useState<
    { siteKey: string; values: ScenarioAssumptions; name: string } | null
  >(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const siteKey = selectedSiteId ?? "__all__";
  const selectedSite = trialSites.find((site) => site.siteId === selectedSiteId);
  const scenario = scenarioForSite(scenarios.data ?? [], trialId ?? "", selectedSiteId);

  if (trials.isPending || arms.isPending || assumptions.isPending || scenarios.isPending) {
    return (
      <Card>
        <Skeleton lines={8} />
      </Card>
    );
  }

  if (!trial) {
    return (
      <EmptyState message="Trial not found." action={{ label: "All trials", to: "/trials" }} />
    );
  }

  const control = trialArms.find((arm) => arm.type === "control");
  if (!control || trialArms.length < 2) {
    return (
      <EmptyState
        message="Economics needs a control and at least one alternative to compare it against."
        action={{ label: "Back to trial", to: `/trials/${trial.trialId}` }}
      />
    );
  }

  const storedValues = scenario
    ? parseScenarioAssumptions(scenario.assumptionsJson)
    : { ...DEFAULT_SCENARIO };
  const liveDraft = draft?.siteKey === siteKey ? draft : null;
  const activeAssumptions = liveDraft?.values ?? storedValues;
  const activeName = liveDraft?.name ?? scenario?.name ?? "Base case";

  const updateDraft = (values: ScenarioAssumptions, name = activeName): void => {
    setDraft({ siteKey, values, name });
    setSaveError(null);
  };

  // Viewing one site uses that site's scenario. Viewing all sites runs each
  // site on its own assumptions and adds the outcomes together, rather than
  // running one averaged scenario that matches no actual site.
  const blending = selectedSiteId === null && trialSites.length > 1;
  const comparisons = blending
    ? blendComparisons(
        trialSites.map((site) =>
          compareArms(
            trialArms,
            trialAssumptions,
            parseScenarioAssumptions(
              scenarioForSite(scenarios.data ?? [], trial.trialId, site.siteId)
                ?.assumptionsJson ?? "",
            ),
          ),
        ),
      )
    : compareArms(trialArms, trialAssumptions, activeAssumptions);

  async function onSaveAndCalculate(): Promise<void> {
    setSaveError(null);
    const record = {
      scenarioId: scenario?.scenarioId ?? newId(),
      trialId: trial!.trialId,
      siteId: selectedSiteId,
      name: activeName,
      assumptionsJson: JSON.stringify(activeAssumptions),
      createdAt: scenario?.createdAt ?? nowIso(),
    };
    const saved = await saveScenario(record);
    if (!saved.success) {
      setSaveError(saved.error);
      return;
    }
    const stored = await saveResults(buildResultSets(record, comparisons, selectedSiteId));
    setSaveError(stored.success ? null : stored.error);
    setSavedMessage(stored.success ? "Scenario saved and results stored." : null);
  }

  return (
    <div className="space-y-4">
      <div>
        <PageTitle>Economics</PageTitle>
        <p className="mt-1 text-ink/60 dark:text-ink-dark/60">{trial.name}</p>
        {/* Split out from the trial's results, and framed as a tool rather
            than a finding. The app declines to do the statistics — the
            response summary says outright that it is not a significance test
            — so performing the economics as though it were settled was the
            one place it claimed more than it knows. What the trial measured
            is on the trial page; everything here is that plus assumptions. */}
        <p className="mt-2 rounded-lg bg-accent/20 p-3 text-sm">
          A what-if tool, not a result. Every figure below is what the trial measured
          combined with the cost and price assumptions further down this page — change an
          assumption and the answer changes. The trial's own results are on the{" "}
          <Link
            to={`/trials/${trial.trialId}`}
            className="font-medium underline"
          >
            trial page
          </Link>
          , and the CSV export there is what to hand to whoever does the analysis properly.
        </p>
      </div>

      {trialSites.length > 1 ? (
        <div role="group" aria-label="Choose site" className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={selectedSiteId === null}
            onClick={() => setSelectedSiteId(null)}
            className={`min-h-11 rounded-full border px-4 py-2 font-medium ${
              selectedSiteId === null
                ? "border-primary bg-primary text-white"
                : "border-ink/20 dark:border-ink-dark/20"
            }`}
          >
            All sites combined
          </button>
          {trialSites.map((site) => (
            <button
              key={site.siteId}
              type="button"
              aria-pressed={selectedSiteId === site.siteId}
              onClick={() => setSelectedSiteId(site.siteId)}
              className={`min-h-11 rounded-full border px-4 py-2 font-medium ${
                selectedSiteId === site.siteId
                  ? "border-primary bg-primary text-white"
                  : "border-ink/20 dark:border-ink-dark/20"
              }`}
            >
              📍 {site.location}
            </button>
          ))}
        </div>
      ) : null}

      {blending ? (
        <Card>
          <h2 className="font-semibold">Scenarios in use</h2>
          <p className="mt-1 text-sm text-ink/60 dark:text-ink-dark/60">
            Each site is calculated on its own season assumptions, then the outcomes are
            added together. Choose a site above to edit its numbers.
          </p>
          <ul className="mt-2 divide-y divide-ink/10 text-sm dark:divide-ink-dark/10">
            {trialSites.map((site) => {
              const siteScenario = scenarioForSite(
                scenarios.data ?? [],
                trial.trialId,
                site.siteId,
              );
              const values = parseScenarioAssumptions(siteScenario?.assumptionsJson ?? "");
              return (
                <li key={site.siteId} className="py-2">
                  <span className="font-medium">📍 {site.location}</span>
                  <span className="text-ink/60 dark:text-ink-dark/60">
                    {" "}
                    — {values.seasonTonnes.toLocaleString()} t at{" "}
                    {formatMoney(values.pricePerTonne)}/t, labour{" "}
                    {formatMoney(values.labourRatePerHour)}/hr
                    {siteScenario?.siteId === null ? " (trial-wide default)" : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : (
      <Card>
        <h2 className="font-semibold">
          Scenario{selectedSite ? ` — ${selectedSite.location}` : ""}
        </h2>
        <p className="mt-1 text-sm text-ink/60 dark:text-ink-dark/60">
          Season-level assumptions the calculations run against
          {selectedSite ? ` at ${selectedSite.location}` : ""}. Change them to test
          sensitivity — nothing is stored until you save.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="scenario-name" className="mb-1 block text-sm font-medium">
              Scenario name
            </label>
            <input
              id="scenario-name"
              className={inputClass}
              value={activeName}
              onChange={(changeEvent) =>
                updateDraft(activeAssumptions, changeEvent.target.value)
              }
            />
          </div>
          <ScenarioNumber
            id="season-tonnes"
            label="Season throughput (t)"
            value={activeAssumptions.seasonTonnes}
            onChange={(value) => updateDraft({ ...activeAssumptions, seasonTonnes: value })}
          />
          <ScenarioNumber
            id="price-per-tonne"
            label="Price per tonne ($)"
            value={activeAssumptions.pricePerTonne}
            onChange={(value) => updateDraft({ ...activeAssumptions, pricePerTonne: value })}
          />
          <ScenarioNumber
            id="labour-rate"
            label="Labour rate ($/hr)"
            value={activeAssumptions.labourRatePerHour}
            onChange={(value) =>
              updateDraft({ ...activeAssumptions, labourRatePerHour: value })
            }
          />
        </div>
        {saveError ? <ErrorState message={saveError} /> : null}
        {savedMessage ? (
          <p role="status" className="mt-2 rounded-lg bg-success/10 p-2 text-sm font-medium text-success">
            {savedMessage}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => void onSaveAndCalculate()}
          className="mt-3 min-h-11 rounded-lg bg-primary px-4 py-2.5 font-medium text-white"
        >
          Save scenario &amp; store results
        </button>
      </Card>
      )}

      <ConfidenceBanner assumptions={trialAssumptions} />

      <section aria-label="Comparison results" className="space-y-3">
        <h2 className="font-display text-lg font-bold">
          Each alternative vs “{control.name}”
          {selectedSite ? ` at ${selectedSite.location}` : " across all sites"}
        </h2>
        {comparisons.map((comparison) => (
          <Card key={comparison.arm.armId}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">{comparison.arm.name}</h3>
              <StatusPill status={comparison.arm.type} />
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-paper p-2 dark:bg-paper-dark">
                <dt className="text-xs text-ink/60 dark:text-ink-dark/60">Net benefit / yr</dt>
                <dd
                  className={`font-display text-xl font-bold ${
                    comparison.netBenefit >= 0 ? "text-success" : "text-danger"
                  }`}
                >
                  {formatMoney(comparison.netBenefit)}
                </dd>
              </div>
              <div className="rounded-lg bg-paper p-2 dark:bg-paper-dark">
                <dt className="text-xs text-ink/60 dark:text-ink-dark/60">Extra capex</dt>
                <dd className="font-display text-xl font-bold">
                  {formatMoney(comparison.extraCapex)}
                </dd>
              </div>
              <div className="rounded-lg bg-paper p-2 dark:bg-paper-dark">
                <dt className="text-xs text-ink/60 dark:text-ink-dark/60">Payback</dt>
                <dd className="font-display text-xl font-bold">
                  {comparison.paybackYears === null
                    ? "—"
                    : comparison.paybackYears === 0
                      ? "Immediate"
                      : `${comparison.paybackYears.toFixed(1)} yrs`}
                </dd>
              </div>
            </dl>
            <p className="mt-2 text-sm text-ink/60 dark:text-ink-dark/60">
              Annual: revenue {formatMoney(comparison.economics.annualRevenue)} − costs{" "}
              {formatMoney(comparison.economics.annualCost)}. Capex{" "}
              {formatMoney(comparison.economics.capex)}.
            </p>
          </Card>
        ))}
      </section>

      <section aria-label="Assumptions" className="space-y-3">
        <h2 className="font-display text-lg font-bold">Assumptions per {word.one}</h2>
        <p className="text-sm text-ink/60 dark:text-ink-dark/60">
          These describe what each {word.one} costs and returns, and apply across every site
          — what differs by site is the season scenario above. Units: $ one-off · $/yr flat
          annual · $/t and hr/t scale with season throughput · %yield values a
          marketable-yield change at the scenario price.
        </p>
        {trialArms.map((arm) => (
          <ArmAssumptionsCard
            key={arm.armId}
            arm={arm}
            assumptions={trialAssumptions.filter(
              (assumption) => assumption.armId === arm.armId,
            )}
          />
        ))}
      </section>

      <MeasuredContext
        trialArms={trialArms}
        events={(events.data ?? []).filter(
          (event) => selectedSiteId === null || event.siteId === selectedSiteId,
        )}
        metrics={metrics.data ?? []}
        siteLabel={selectedSite?.location ?? null}
      />

      <Link
        to={`/trials/${trial.trialId}`}
        className="inline-block min-h-11 rounded-lg border border-ink/20 px-4 py-2.5 font-medium dark:border-ink-dark/20"
      >
        Back to trial
      </Link>
    </div>
  );
}

function ScenarioNumber({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        className={inputClass}
        value={value}
        onChange={(changeEvent) => onChange(Number(changeEvent.target.value) || 0)}
      />
    </div>
  );
}

const CATEGORIES: AssumptionCategory[] = ["capex", "opex", "labour", "revenue", "other"];

function ArmAssumptionsCard({
  arm,
  assumptions,
}: {
  arm: PracticeArm;
  assumptions: ArmAssumption[];
}) {
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<AssumptionCategory>("opex");
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState<string>("$/yr");
  const [error, setError] = useState<string | null>(null);

  async function onAdd(): Promise<void> {
    setError(null);
    const result = await saveAssumption({
      assumptionId: newId(),
      armId: arm.armId,
      category,
      fieldName: label.trim() || "assumption",
      value: Number(value) || 0,
      unit,
      // Everything starts indicative. Confirming is a deliberate act, because
      // it is what turns a modelled figure into one the grower can rely on.
      status: "placeholder",
      createdAt: nowIso(),
    });
    if (!result.success) {
      setError(result.error);
      return;
    }
    setLabel("");
    setValue("");
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{arm.name}</h3>
        <StatusPill status={arm.type} />
      </div>

      {assumptions.length === 0 ? (
        <p className="mt-2 text-sm text-ink/50 dark:text-ink-dark/50">
          No assumptions yet — the calculation treats this practice as $0 either way.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-ink/10 text-sm dark:divide-ink-dark/10">
          {assumptions.map((assumption) => (
            <li
              key={assumption.assumptionId}
              className="flex flex-wrap items-center gap-2 py-2"
            >
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium capitalize text-primary dark:bg-primary-soft/20 dark:text-primary-soft">
                {assumption.category}
              </span>
              <span className="min-w-[9rem] flex-1">{assumption.fieldName}</span>
              <span className="font-medium">
                {String(assumption.value)} {assumption.unit}
              </span>
              <ConfirmToggle assumption={assumption} />
              <button
                type="button"
                aria-label={`Remove ${assumption.fieldName}`}
                onClick={() => void removeAssumption(assumption.assumptionId)}
                className="min-h-11 min-w-11 rounded-lg border border-danger/40 text-danger"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        className="mt-3 grid gap-2 sm:grid-cols-[1fr_8rem_6rem_6rem_auto]"
        onSubmit={(submitEvent) => {
          submitEvent.preventDefault();
          void onAdd();
        }}
      >
        <input
          aria-label={`New assumption for ${arm.name}`}
          placeholder="e.g. Grading labour"
          className={inputClass}
          value={label}
          onChange={(changeEvent) => setLabel(changeEvent.target.value)}
          required
        />
        <select
          aria-label="Category"
          className={inputClass}
          value={category}
          onChange={(changeEvent) => setCategory(changeEvent.target.value as AssumptionCategory)}
        >
          {CATEGORIES.map((candidate) => (
            <option key={candidate} value={candidate}>
              {candidate}
            </option>
          ))}
        </select>
        <input
          aria-label="Value"
          type="number"
          step="any"
          placeholder="Value"
          className={inputClass}
          value={value}
          onChange={(changeEvent) => setValue(changeEvent.target.value)}
          required
        />
        <select
          aria-label="Unit"
          className={inputClass}
          value={unit}
          onChange={(changeEvent) => setUnit(changeEvent.target.value)}
        >
          {ASSUMPTION_UNITS.map((candidate) => (
            <option key={candidate} value={candidate}>
              {candidate}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="min-h-11 rounded-lg bg-primary px-4 font-medium text-white"
        >
          Add
        </button>
      </form>
      {error ? (
        <p role="alert" className="mt-1 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </Card>
  );
}

/**
 * Whether a figure is a stand-in or the grower's real number. Kept as one tap
 * on the row itself: chasing down a cost happens one line at a time, usually
 * with an invoice in the other hand.
 */
function ConfirmToggle({ assumption }: { assumption: ArmAssumption }) {
  const confirmed = (assumption.status ?? "placeholder") === "confirmed";
  return (
    <button
      type="button"
      aria-pressed={confirmed}
      aria-label={`Mark ${assumption.fieldName} as ${
        confirmed ? "a placeholder" : "confirmed"
      }`}
      onClick={() =>
        void saveAssumption({
          ...assumption,
          status: confirmed ? "placeholder" : "confirmed",
        })
      }
      className={`min-h-11 rounded-full border px-3 text-xs font-medium ${
        confirmed
          ? "border-success/40 bg-success/10 text-success"
          : "border-warning/40 bg-warning/10 text-warning"
      }`}
    >
      {confirmed ? "✓ Confirmed" : "Placeholder"}
    </button>
  );
}

/**
 * Says out loud how much of the result below is modelled. Every figure starts
 * as a placeholder, so without this a demonstration number reads exactly like
 * a grower's own — and gets quoted as if it were.
 */
function ConfidenceBanner({ assumptions }: { assumptions: ArmAssumption[] }) {
  const confidence = assumptionConfidence(assumptions);
  if (confidence.total === 0) return null;

  if (confidence.placeholder === 0) {
    return (
      <p className="rounded-xl border border-success/30 bg-success/10 p-3 text-sm text-success">
        ✓ Every figure below is confirmed against real costs.
      </p>
    );
  }

  const names = [...new Set(confidence.placeholderNames)];
  return (
    <section
      aria-label="How reliable these figures are"
      className="rounded-xl border border-warning/40 bg-warning/10 p-3"
    >
      <h2 className="font-semibold text-warning">
        Indicative only — {confidence.placeholder} of {confidence.total}{" "}
        {confidence.total === 1 ? "figure is" : "figures are"} still a placeholder
      </h2>
      <p className="mt-1 text-sm text-ink/70 dark:text-ink-dark/70">
        The results below are worked out from stand-in numbers, not this grower's costs.
        Replace them with real figures and mark each one confirmed before the payback is
        quoted to anyone.
      </p>
      <p className="mt-1 text-sm text-ink/60 dark:text-ink-dark/60">
        Still to confirm: {names.join(", ")}.
      </p>
    </section>
  );
}

function MeasuredContext({
  trialArms,
  events,
  metrics,
  siteLabel,
}: {
  trialArms: PracticeArm[];
  events: Array<{ eventId: string; armId: string | null }>;
  metrics: Metric[];
  siteLabel: string | null;
}) {
  return (
    <Card>
      <h2 className="font-semibold">
        Measured so far{siteLabel ? ` — ${siteLabel}` : ""}
      </h2>
      <p className="mt-1 text-sm text-ink/60 dark:text-ink-dark/60">
        Field data collected to date — use it to ground the assumptions above.
      </p>
      <ul className="mt-2 divide-y divide-ink/10 text-sm dark:divide-ink-dark/10">
        {trialArms.map((arm) => {
          const eventIds = new Set(
            events.filter((event) => event.armId === arm.armId).map((event) => event.eventId),
          );
          const numbersFor = (name: string) =>
            metrics
              .filter((metric) => eventIds.has(metric.eventId) && metric.metricName === name)
              .map((metric) => metricNumber(metric.value))
              .filter((value): value is number => value !== null);
          const tonnes = numbersFor("tonnesHandled").reduce((sum, value) => sum + value, 0);
          const hours = numbersFor("runDuration").reduce((sum, value) => sum + value, 0);
          return (
            <li key={arm.armId} className="flex flex-wrap items-center gap-2 py-2">
              <span className="flex-1">{arm.name}</span>
              <span className="text-ink/60 dark:text-ink-dark/60">
                {eventIds.size} entries
                {tonnes > 0 ? ` · ${tonnes.toFixed(1)} t` : ""}
                {tonnes > 0 && hours > 0 ? ` · ${(tonnes / hours).toFixed(1)} t/hr` : ""}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
