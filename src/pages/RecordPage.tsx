// The front door for whoever is in the paddock.
//
// The app opened on a staff dashboard, so a contractor arriving without a link
// had to work through Trials, then a trial, then the entry links card, to
// reach the only screen they came for. This is that screen's front door: pick
// where you are, and start recording.
//
// It sits outside the staff guard on purpose. Recording must never need an
// account — the same reason the entry form itself is public — so this has to
// keep working once staff sign-in is switched on.

import { Link } from "react-router-dom";
import { useArms, useEvents, useSites, useTemplates, useTrials } from "../hooks/useCollections";
import { setDeviceRole } from "../services/store";
import { eventsForTrial } from "../services/events";
import { useAccess } from "../contexts/AccessContext";
import { Card, EmptyState, PageTitle, Skeleton } from "../components/ui";
import type { MeasurementEvent, Site, Trial } from "../types";

/** When this device last recorded at a site — newest first puts it on top. */
function lastRecordedAt(events: MeasurementEvent[], siteId: string): string {
  let latest = "";
  for (const event of events) {
    if (event.siteId === siteId && event.createdAt > latest) latest = event.createdAt;
  }
  return latest;
}

export function RecordPage() {
  const trials = useTrials();
  const sites = useSites();
  const arms = useArms();
  const templates = useTemplates();
  const events = useEvents();
  const { accessCode } = useAccess();

  const loading =
    trials.isPending || sites.isPending || arms.isPending || templates.isPending;

  if (loading) {
    return (
      <Card>
        <Skeleton lines={6} />
      </Card>
    );
  }

  // Only somewhere you could actually record: a trial with a form, at least
  // one practice, and this site. Offering a dead end is worse than offering
  // nothing, because it costs a walk to find out.
  const allTrials = trials.data ?? [];
  const allSites = sites.data ?? [];
  const allArms = arms.data ?? [];
  const allTemplates = templates.data ?? [];
  const allEvents = events.data ?? [];

  const options: Array<{ trial: Trial; site: Site; form: string; recent: string }> = [];
  for (const trial of allTrials) {
    // A finished or shelved trial should not be offered to walk to.
    if (trial.status === "completed" || trial.status === "archived") continue;
    const form = allTemplates.find(
      (template) => template.trialId === trial.trialId && template.audience === "grower",
    );
    const hasArms = allArms.some((arm) => arm.trialId === trial.trialId && !arm.archived);
    if (!form || !hasArms) continue;
    for (const site of allSites.filter((candidate) => candidate.trialId === trial.trialId)) {
      options.push({
        trial,
        site,
        form: form.templateId,
        recent: lastRecordedAt(
          eventsForTrial(allEvents, trial.trialId, allSites, allArms),
          site.siteId,
        ),
      });
    }
  }
  options.sort((a, b) => b.recent.localeCompare(a.recent) || a.site.location.localeCompare(b.site.location));

  return (
    <div className="space-y-4">
      <div>
        <PageTitle>Record an observation</PageTitle>
        <p className="mt-1 text-ink-soft">
          Pick where you are. Somewhere you have recorded before comes first.
        </p>
      </div>

      {options.length === 0 ? (
        <EmptyState message="No trial is ready for entries yet. Whoever set it up needs to add a site and the practices being compared." />
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {options.map((option) => (
              <li key={`${option.trial.trialId}-${option.site.siteId}`}>
                <Link
                  to={`/trials/${option.trial.trialId}/entry?form=${option.form}&site=${
                    option.site.siteId
                  }&code=${encodeURIComponent(accessCode)}`}
                  className="flex min-h-16 items-center gap-3 py-3"
                >
                  <span className="text-2xl" aria-hidden>
                    📍
                  </span>
                  <span className="flex-1">
                    <span className="block font-display text-title text-primary dark:text-primary-soft">
                      {option.site.location}
                    </span>
                    <span className="block text-sm text-ink-soft">
                      {option.trial.name}
                      {option.recent ? " · recorded here before" : ""}
                    </span>
                  </span>
                  <span aria-hidden className="text-xl text-ink-faint">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* The way out, and the way this device stops opening here. */}
      <Card>
        <h2 className="font-semibold">Setting up trials instead?</h2>
        <p className="mt-1 text-sm text-ink-soft">
          This device opens on recording because that is what it was last used for. Follow
          this and it will open on the dashboard again.
        </p>
        <Link
          to="/"
          onClick={() => void setDeviceRole("setup")}
          className="mt-3 inline-block min-h-11 rounded-lg border border-primary px-4 py-2.5 font-medium text-primary dark:text-primary-soft"
        >
          Go to trial setup
        </Link>
      </Card>
    </div>
  );
}
