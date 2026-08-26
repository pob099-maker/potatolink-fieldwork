// Everything the three trial screens need, loaded once and the same way.
//
// The overview, the setup page and the results page all describe the same
// trial, so they must agree about it — which plots are recorded, whether the
// layout is frozen, what the trial calls its treatments. Three pages each
// assembling that themselves is three chances to drift, and the kind of drift
// nobody notices until two screens disagree in front of a grower.

import { useMemo } from "react";
import {
  useArms,
  useContacts,
  useEvents,
  useMetrics,
  useSites,
  useSoilResults,
  useSoilSamples,
  useTemplates,
  useTrials,
  useWeather,
  useFactors,
  useFactorLevels,
} from "./useCollections";
import { eventsForTrial } from "../services/events";
import { buildDueList, todayIso } from "../services/dueList";
import { generateLayout, layoutProblem } from "../services/layout";
import { words, type Words } from "../services/vocabulary";
import type {
  Contact,
  FormTemplate,
  MeasurementEvent,
  Metric,
  PracticeArm,
  Site,
  SoilResult,
  SoilSample,
  Trial,
  WeatherObservation,
  Factor,
  FactorLevel,
} from "../types";
import type { DueItem } from "../services/timing";

export interface TrialData {
  loading: boolean;
  failed: boolean;
  refetch: () => void;
  trial: Trial | undefined;
  sites: Site[];
  arms: PracticeArm[];
  activeArms: PracticeArm[];
  templates: FormTemplate[];
  /** The first form somebody in the paddock fills in, if there is one. */
  growerForm: FormTemplate | undefined;
  events: MeasurementEvent[];
  metrics: Metric[];
  contacts: Contact[];
  weather: WeatherObservation[];
  soilSamples: SoilSample[];
  soilResults: SoilResult[];
  factors: Factor[];
  levels: FactorLevel[];
  /** A trial is factorial once it has factors with levels. */
  isFactorial: boolean;
  due: DueItem[];
  /** Records already filed against a plot. Above zero, the layout is frozen. */
  plotRecords: number;
  layoutLocked: boolean;
  /** `siteId:armId:replicate` → the number painted on the peg. */
  plotNumbers: Map<string, number>;
  word: Words;
}

export function useTrialData(trialId: string | undefined): TrialData {
  const trials = useTrials();
  const sites = useSites();
  const arms = useArms();
  const templates = useTemplates();
  const events = useEvents();
  const metrics = useMetrics();
  const contacts = useContacts();
  const weather = useWeather();
  const soilSamples = useSoilSamples();
  const soilResults = useSoilResults();
  const factors = useFactors();
  const factorLevels = useFactorLevels();

  const trial = (trials.data ?? []).find((candidate) => candidate.trialId === trialId);
  const trialSites = (sites.data ?? []).filter((site) => site.trialId === trialId);
  const trialArms = (arms.data ?? []).filter((arm) => arm.trialId === trialId);
  // Sorted here rather than at each call site. IndexedDB returns key order,
  // and the keys are random UUIDs, so an unsorted list renders treatments in a
  // different order on every device. The layout engine sorts for itself, which
  // is what keeps a seed reproducible; this is so the screen agrees with it.
  const activeArms = trialArms
    .filter((arm) => !arm.archived)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const trialTemplates = (templates.data ?? []).filter((form) => form.trialId === trialId);

  const trialEvents = useMemo(
    () => eventsForTrial(events.data ?? [], trialId ?? "", trialSites, trialArms),
    [events.data, trialId, trialSites, trialArms],
  );

  const plotRecords = useMemo(
    () => trialEvents.filter((event) => event.plot !== null).length,
    [trialEvents],
  );

  // The same per-site layouts the plot map draws, indexed so anything that
  // needs to name a plot can, rather than falling back to "replicate 3".
  const plotNumbers = useMemo(() => {
    const index = new Map<string, number>();
    if (!trial || trial.design !== "replicated" || !trial.layoutSeed) return index;
    for (const site of trialSites) {
      const request = {
        design: trial.blocking === "blocks" ? ("rcb" as const) : ("crd" as const),
        arms: activeArms,
        replicates: trial.replicates,
        seed: trial.layoutSeed,
        siteId: site.siteId,
      };
      if (layoutProblem(request)) continue;
      for (const plot of generateLayout(request)) {
        index.set(`${site.siteId}:${plot.armId}:${plot.replicate}`, plot.plotNumber);
      }
    }
    return index;
  }, [trial, trialSites, activeArms]);

  const trialFactors = (factors.data ?? [])
    .filter((factor) => factor.trialId === trialId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const trialLevels = (factorLevels.data ?? []).filter((level) =>
    trialFactors.some((factor) => factor.factorId === level.factorId),
  );

  const due = useMemo(
    () =>
      trial
        ? buildDueList({
            trials: [trial],
            sites: trialSites,
            templates: trialTemplates,
            events: trialEvents,
            today: todayIso(),
          })
        : [],
    [trial, trialSites, trialTemplates, trialEvents],
  );

  return {
    loading: trials.isPending || sites.isPending || arms.isPending || events.isPending,
    failed: trials.isError || sites.isError || events.isError,
    refetch: () => void trials.refetch(),
    trial,
    sites: trialSites,
    arms: trialArms,
    activeArms,
    templates: trialTemplates,
    growerForm: trialTemplates.find((form) => form.audience === "grower"),
    events: trialEvents,
    metrics: metrics.data ?? [],
    contacts: contacts.data ?? [],
    weather: weather.data ?? [],
    soilSamples: soilSamples.data ?? [],
    soilResults: soilResults.data ?? [],
    factors: trialFactors,
    levels: trialLevels,
    isFactorial: trialFactors.length > 0 && trialLevels.length > 0,
    due,
    plotRecords,
    layoutLocked: plotRecords > 0,
    plotNumbers,
    // A trial that has not loaded still needs a word for its treatments, or
    // every heading on the page renders "undefined".
    word: words(trial ?? { vocabulary: null, design: "observational" }),
  };
}
