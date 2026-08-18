import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ASSUMPTION_UNITS,
  buildResultSets,
  compareArms,
  DEFAULT_SCENARIO,
  formatMoney,
  parseScenarioAssumptions,
  type ScenarioAssumptions,
} from "../services/economics";
import { removeAssumption, saveAssumption, saveResults, saveScenario } from "../services/store";
import { newId, nowIso } from "../lib/id";
import {
  useArms,
  useAssumptions,
  useEvents,
  useMetrics,
  useScenarios,
  useTrials,
} from "../hooks/useCollections";
import { Card, EmptyState, ErrorState, PageTitle, Skeleton, StatusPill } from "../components/ui";
import type { ArmAssumption, AssumptionCategory, PracticeArm } from "../types";

const inputClass =
  "w-full min-h-11 rounded-lg border border-ink/20 bg-surface px-3 py-2 " +
  "focus:border-primary focus:outline-none dark:border-ink-dark/20 dark:bg-surface-dark";

export function ResultsPage() {
  const { trialId } = useParams<{ trialId: string }>();
  const trials = useTrials();
  const arms = useArms();
  const assumptions = useAssumptions();
  const scenarios = useScenarios();
  const events = useEvents();
  const metrics = useMetrics();

  const trial = trials.data?.find((candidate) => candidate.trialId === trialId);
  const trialArms = useMemo(
    () =>
      (arms.data ?? [])
        .filter((arm) => arm.trialId === trialId)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [arms.data, trialId],
  );
  const armIds = useMemo(() => new Set(trialArms.map((arm) => arm.armId)), [trialArms]);
  const trialAssumptions = useMemo(
    () => (assumptions.data ?? []).filter((assumption) => armIds.has(assumption.armId)),
    [assumptions.data, armIds],
  );
  const scenario = scenarios.data?.find((candidate) => candidate.trialId === trialId);

  const [scenarioDraft, setScenarioDraft] = useState<ScenarioAssumptions | null>(null);
  const [scenarioName, setScenarioName] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

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
        message="Economics needs a control arm and at least one alternative configured."
        action={{ label: "Back to trial", to: `/trials/${trial.trialId}` }}
      />
    );
  }

  const activeAssumptions =
    scenarioDraft ??
    (scenario ? parseScenarioAssumptions(scenario.assumptionsJson) : { ...DEFAULT_SCENARIO });
  const activeName = scenarioName ?? scenario?.name ?? "Base case";

  const comparisons = compareArms(trialArms, trialAssumptions, activeAssumptions);

  async function onSaveAndCalculate(): Promise<void> {
    setSaveError(null);
    const record = {
      scenarioId: scenario?.scenarioId ?? newId(),
      trialId: trial!.trialId,
      name: activeName,
      assumptionsJson: JSON.stringify(activeAssumptions),
      createdAt: scenario?.createdAt ?? nowIso(),
    };
    const saved = await saveScenario(record);
    if (!saved.success) {
      setSaveError(saved.error);
      return;
    }
    await saveResults(buildResultSets(saved.data, comparisons));
  }

  return (
    <div className="space-y-4">
      <div>
        <PageTitle>Results &amp; economics</PageTitle>
        <p className="mt-1 text-ink/60 dark:text-ink-dark/60">{trial.name}</p>
      </div>

      <Card>
        <h2 className="font-semibold">Scenario</h2>
        <p className="mt-1 text-sm text-ink/60 dark:text-ink-dark/60">
          Season-level assumptions the calculations run against. Change them to test
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
              onChange={(changeEvent) => setScenarioName(changeEvent.target.value)}
            />
          </div>
          <ScenarioNumber
            id="season-tonnes"
            label="Season throughput (t)"
            value={activeAssumptions.seasonTonnes}
            onChange={(value) =>
              setScenarioDraft({ ...activeAssumptions, seasonTonnes: value })
            }
          />
          <ScenarioNumber
            id="price-per-tonne"
            label="Price per tonne ($)"
            value={activeAssumptions.pricePerTonne}
            onChange={(value) =>
              setScenarioDraft({ ...activeAssumptions, pricePerTonne: value })
            }
          />
          <ScenarioNumber
            id="labour-rate"
            label="Labour rate ($/hr)"
            value={activeAssumptions.labourRatePerHour}
            onChange={(value) =>
              setScenarioDraft({ ...activeAssumptions, labourRatePerHour: value })
            }
          />
        </div>
        {saveError ? <ErrorState message={saveError} /> : null}
        <button
          type="button"
          onClick={() => void onSaveAndCalculate()}
          className="mt-3 min-h-11 rounded-lg bg-primary px-4 py-2.5 font-medium text-white"
        >
          Save scenario &amp; store results
        </button>
      </Card>

      <section aria-label="Comparison results" className="space-y-3">
        <h2 className="font-display text-lg font-bold">
          Each alternative vs “{control.name}”
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
        <h2 className="font-display text-lg font-bold">Assumptions per practice</h2>
        <p className="text-sm text-ink/60 dark:text-ink-dark/60">
          Units: $ one-off · $/yr flat annual · $/t and hr/t scale with season throughput ·
          %yield values a marketable-yield change at the scenario price.
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

      <MeasuredContext trialArms={trialArms} events={events.data ?? []} metrics={metrics.data ?? []} />

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
            <li key={assumption.assumptionId} className="flex items-center gap-2 py-2">
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium capitalize text-primary dark:bg-primary-soft/20 dark:text-primary-soft">
                {assumption.category}
              </span>
              <span className="flex-1">{assumption.fieldName}</span>
              <span className="font-medium">
                {String(assumption.value)} {assumption.unit}
              </span>
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

function MeasuredContext({
  trialArms,
  events,
  metrics,
}: {
  trialArms: PracticeArm[];
  events: Array<{ eventId: string; armId: string }>;
  metrics: Array<{ eventId: string; metricName: string; value: number | string }>;
}) {
  return (
    <Card>
      <h2 className="font-semibold">Measured so far</h2>
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
              .map((metric) => Number(metric.value))
              .filter((value) => Number.isFinite(value));
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
