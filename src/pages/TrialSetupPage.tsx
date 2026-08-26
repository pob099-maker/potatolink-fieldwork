// Setting a trial up: the work that happens once.
//
// Everything here is visited hard for an hour and then rarely again, which is
// exactly why it does not belong on the page somebody opens every week to ask
// whether anything is due. Grouped in the order a trial is actually built —
// what is being compared, where, how it is arranged, what gets asked, what
// else is being recorded — so it reads as a sequence with an end rather than a
// wall of cards.

import { Link, useParams } from "react-router-dom";
import { useTrialData } from "../hooks/useTrialData";
import { saveSite } from "../services/store";
import { Card, EmptyState, ErrorState, PageTitle, Section, Skeleton } from "../components/ui";
import { SetupChecklist, SiteManager } from "../components/TrialSetup";
import { PlotLayout } from "../components/PlotLayout";
import { DataSources } from "../components/DataSources";
import { PlantingCard } from "../components/ObservationTiming";
import { SoilCard, WeatherCard } from "../components/WeatherAndSoil";
import { ArmManager, RemoveTrial, TrialDesignCard, TrialForms, TrialStage } from "../components/trial/cards";

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
          The decisions a trial is built from. Most of this is done once, before the crop
          goes in — after that it is here to check rather than to change.
        </p>
      </div>

      <SetupChecklist trial={trial} sites={sites} arms={activeArms} templates={templates} />

      <Section
        title={`What is being compared`}
        description={`The ${word.many}, and whether the trial is replicated for analysis or an observational comparison.`}
      >
        <TrialDesignCard trial={trial} templates={templates} layoutLocked={data.layoutLocked} />
        <ArmManager
          trialId={trial.trialId}
          arms={arms}
          layoutLocked={data.layoutLocked}
          word={word}
        />
      </Section>

      <Section
        title="Where it runs"
        description="Each site is randomised separately, and each has its own planting date."
      >
        <SiteManager trialId={trial.trialId} sites={sites} />
        <PlantingCard sites={sites} />
        <PlotLayout trial={trial} arms={activeArms} sites={sites} recorded={data.plotRecords} />
      </Section>

      <Section
        title="What gets recorded"
        description="A form for each visit, and when each one is wanted."
      >
        <TrialForms trial={trial} templates={templates} word={word} />
      </Section>

      <Section
        title="Conditions"
        description="Weather and soil for the site, and anything else feeding this trial that the app does not collect itself."
      >
        <WeatherCard
          sites={sites}
          observations={data.weather}
          onSiteChange={(next) => void saveSite(next)}
        />
        <SoilCard
          trial={trial}
          sites={sites}
          samples={data.soilSamples}
          results={data.soilResults}
        />
        <DataSources trial={trial} sites={sites} arms={activeArms} />
      </Section>

      <Section
        title="Stage"
        description="Where the trial is in its life, and how to finish with it."
      >
        <TrialStage trial={trial} />
        <RemoveTrial trial={trial} />
      </Section>
    </div>
  );
}
