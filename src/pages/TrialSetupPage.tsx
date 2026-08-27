// Setting a trial up: the work that happens once.
//
// This page shows what *this* trial needs and folds away what it does not.
//
// Splitting the trial page got the overview from thirteen screens to one and a
// half, but setup still cost seven screens for a grower comparing two ways of
// handling potatoes — because every card rendered whether or not the trial had
// any use for it. Six hundred pixels of lifecycle stages, five hundred of
// growth stages and two hundred of soil profile, for somebody who wanted to
// compare two practices.
//
// So three tiers:
//
//   Always open — what is being compared, where it runs, what gets recorded.
//   That is the trial, and every trial has one.
//
//   Only when it applies — the plot layout appears for a replicated trial;
//   planting dates appear once a form is actually scheduled against a growth
//   stage. Showing a randomisation card to an observational comparison is
//   offering an answer to a question nobody asked.
//
//   Folded — weather, soil, provenance, stage, removal. Real capability, and
//   most trials never touch it. Each fold carries a one-line summary so it
//   still says what is inside without being opened.

import { Link, useParams } from "react-router-dom";
import { useTrialData } from "../hooks/useTrialData";
import { saveSite } from "../services/store";
import { TRIAL_STATES } from "../services/lifecycle";
import { describeDepth } from "../services/soilAttributes";
import {
  Card,
  EmptyState,
  ErrorState,
  Foldaway,
  PageTitle,
  Section,
  Skeleton,
} from "../components/ui";
import { SetupChecklist, SiteManager } from "../components/TrialSetup";
import { TrialPeople } from "../components/TrialPeople";
import { PlotLayout } from "../components/PlotLayout";
import { DataSources } from "../components/DataSources";
import { PlantingCard } from "../components/ObservationTiming";
import { SoilCard, WeatherCard } from "../components/WeatherAndSoil";
import { FactorialDesign } from "../components/FactorialDesign";
import {
  ArmManager,
  RemoveTrial,
  TrialDesignCard,
  TrialForms,
  TrialStage,
} from "../components/trial/cards";

export function TrialSetupPage() {
  const { trialId } = useParams();
  const data = useTrialData(trialId);

  if (data.loading) {
    return (
      <Card>
        <Skeleton lines={8} />
      </Card>
    );
  }
  if (data.failed) {
    return <ErrorState message="Could not load this trial." onRetry={data.refetch} />;
  }
  if (!data.trial) {
    return <EmptyState message="Trial not found." action={{ label: "All trials", to: "/trials" }} />;
  }

  const { trial, sites, arms, activeArms, templates, word } = data;

  const replicated = trial.design === "replicated";
  // Planting dates only earn their space once something is scheduled against a
  // growth stage. Until then they are a date field with nothing hanging off it.
  const scheduled = templates.some((form) => form.timing !== null);

  const stationsSet = sites.filter((site) => site.bomStationId).length;
  const soilForTrial = data.soilSamples.filter((sample) =>
    sites.some((site) => site.siteId === sample.siteId),
  );
  const depths = [...new Set(soilForTrial.map((s) => describeDepth(s.depthFromCm, s.depthToCm)))];
  const sourceCount = (trial.dataSources ?? []).length;
  const stageLabel = TRIAL_STATES.find((state) => state.value === trial.status)?.label ?? trial.status;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link
          to={`/trials/${trial.trialId}`}
          className="min-h-11 py-2.5 font-medium text-primary underline dark:text-primary-soft"
        >
          ← {trial.name}
        </Link>
        <PageTitle>Set up</PageTitle>
        <p className="mt-1 text-ink-soft">
          The decisions this trial is built from. Anything it does not use is folded away
          at the bottom rather than filling the page.
        </p>
      </div>

      <SetupChecklist trial={trial} sites={sites} arms={activeArms} templates={templates} />

      <Section
        title="What is being compared"
        description={`The ${word.many}, and whether this is a replicated experiment or an observational comparison.`}
      >
        <TrialDesignCard trial={trial} templates={templates} layoutLocked={data.layoutLocked} />
        {/* Factors produce the arms below, so they come first. A trial with no
            factors never sees this — it is folded until somebody asks for it. */}
        {data.isFactorial ? (
          <FactorialDesign
            trial={trial}
            factors={data.factors}
            levels={data.levels}
            layoutLocked={data.layoutLocked}
          />
        ) : (
          <Foldaway
            title="Compare combinations of two things at once"
            summary="A factorial design — every variety at every nitrogen rate, say."
          >
            <FactorialDesign
              trial={trial}
              factors={data.factors}
              levels={data.levels}
              layoutLocked={data.layoutLocked}
            />
          </Foldaway>
        )}
        <ArmManager
          trialId={trial.trialId}
          arms={arms}
          layoutLocked={data.layoutLocked}
          word={word}
        />
      </Section>

      <Section
        title="Where it runs"
        description={
          replicated
            ? "Each site is randomised separately from one stored seed."
            : "The paddocks this trial runs in."
        }
      >
        <SiteManager trialId={trial.trialId} sites={sites} />
        {/* A randomisation card has nothing to say to an observational
            comparison, and saying it anyway invites somebody to wonder what
            they have got wrong. */}
        {replicated ? (
          <PlotLayout trial={trial} arms={activeArms} sites={sites} recorded={data.plotRecords} />
        ) : null}
        {/* Directly under the sites, because a site is what makes somebody
            involved — the panel is mostly a reading of what the sites say. */}
        <TrialPeople trialId={trial.trialId} />
      </Section>

      <Section
        title="What gets recorded"
        description="A form for each visit, and when each one is wanted."
      >
        <TrialForms trial={trial} templates={templates} word={word} />
        {scheduled ? <PlantingCard sites={sites} /> : null}
      </Section>

      {/* Everything below here is real capability that most trials never
          touch. Folded, but each one says what is inside it. */}
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-title text-primary dark:text-primary-soft">
          If you need it
        </h2>

        {!scheduled ? (
          <Foldaway
            title="Planting and growth stages"
            summary="Set a planting date to schedule observations against the crop."
          >
            <PlantingCard sites={sites} />
          </Foldaway>
        ) : null}

        <Foldaway
          title="Weather"
          summary={
            stationsSet > 0
              ? `${stationsSet} of ${sites.length} sites linked to a BOM station.`
              : "No weather station linked."
          }
        >
          <WeatherCard
            sites={sites}
            observations={data.weather}
            onSiteChange={(next) => void saveSite(next)}
          />
        </Foldaway>

        <Foldaway
          title="Soil"
          summary={
            soilForTrial.length > 0
              ? `${soilForTrial.length} samples, ${depths.join(", ")}.`
              : "No soil results recorded."
          }
        >
          <SoilCard
            trial={trial}
            sites={sites}
            samples={data.soilSamples}
            results={data.soilResults}
          />
        </Foldaway>

        <Foldaway
          title="Where the data comes from"
          summary={
            sourceCount > 0
              ? `${sourceCount} source${sourceCount === 1 ? "" : "s"} recorded.`
              : "Nothing recorded beyond what the app collects itself."
          }
        >
          <DataSources trial={trial} sites={sites} arms={activeArms} />
        </Foldaway>

        <Foldaway title="Stage and removal" summary={`Currently ${stageLabel.toLowerCase()}.`}>
          <TrialStage trial={trial} />
          <RemoveTrial trial={trial} />
        </Foldaway>
      </section>
    </div>
  );
}
