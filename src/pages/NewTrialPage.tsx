// Starting point for a new trial: import a filled-in template, or build one
// by hand. Both routes end in the same place — a trial with a setup checklist
// showing whatever is still missing.

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { addTrial } from "../services/store";
import { downloadReferenceTemplate } from "../services/templateImport";
import { useProjects } from "../hooks/useCollections";
import { Card, ErrorState, PageTitle } from "../components/ui";

export function NewTrialPage() {
  const navigate = useNavigate();
  const projects = useProjects();
  const [name, setName] = useState("");
  const [objective, setObjective] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const inputClass =
    "min-h-11 w-full rounded-lg border border-ink/20 bg-surface px-3 dark:border-ink-dark/20 dark:bg-surface-dark";

  async function onCreate(): Promise<void> {
    const projectId = projects.data?.[0]?.projectId;
    if (!projectId) {
      setError("No project available to attach the trial to.");
      return;
    }
    setCreating(true);
    setError(null);
    const result = await addTrial({ projectId, name: name.trim(), objective: objective.trim() });
    setCreating(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    navigate(`/trials/${result.data.trialId}`);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <PageTitle>Start a new trial</PageTitle>
        <p className="mt-1 text-ink/60 dark:text-ink-dark/60">
          Three ways in, all landing on the same trial page with a checklist of anything
          still to set up.
        </p>
      </div>

      {/* First, and deliberately. The other two ask you to already know the
          model — one as a sixteen-column CSV, the other as a blank trial to
          furnish from five separate cards. This one asks questions. */}
      <Card className="border-accent/50">
        <h2 className="font-display text-lg font-bold">Answer a few questions</h2>
        <p className="mt-1 text-sm text-ink/60 dark:text-ink-dark/60">
          The quickest way in, and it suits both ends: a grower comparing two practices is
          finished in four screens, and anybody who already has the brief can skip
          straight to the review and correct the defaults. You end up with a trial you can
          record against — sites, what is being compared, and the questions asked in the
          field.
        </p>
        <Link
          to="/trials/wizard"
          className="mt-3 inline-block min-h-11 rounded-lg bg-primary px-4 py-2.5 font-medium text-white"
        >
          Set up a trial
        </Link>
      </Card>

      <Card>
        <h2 className="font-display text-lg font-bold">Import a template</h2>
        <p className="mt-1 text-sm text-ink/60 dark:text-ink-dark/60">
          For a protocol that already lives in a spreadsheet. The template covers the whole
          trial in one file — every site, practice and question — which is more to fill in
          than the questions above, and the only way to bring a lot of fields at once.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => downloadReferenceTemplate()}
            className="min-h-11 rounded-lg bg-primary px-4 py-2.5 font-medium text-white"
          >
            1. Download the blank template
          </button>
          <Link
            to="/trials/import"
            className="min-h-11 rounded-lg border border-primary px-4 py-2.5 font-medium text-primary dark:text-primary-soft"
          >
            2. Upload the filled-in file
          </Link>
        </div>
      </Card>

      <Card>
        <h2 className="font-display text-lg font-bold">Build it here</h2>
        <p className="mt-1 text-sm text-ink/60 dark:text-ink-dark/60">
          A bare trial with nothing in it, to furnish card by card on the trial page. Worth
          it only if you want to build the structure by hand.
        </p>
        <form
          className="mt-3 space-y-3"
          onSubmit={(submitEvent) => {
            submitEvent.preventDefault();
            void onCreate();
          }}
        >
          <div>
            <label htmlFor="trial-name" className="mb-1 block text-sm font-medium">
              Trial name
            </label>
            <input
              id="trial-name"
              value={name}
              onChange={(changeEvent) => setName(changeEvent.target.value)}
              required
              placeholder="e.g. Tolga Demosite Trial"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="trial-objective" className="mb-1 block text-sm font-medium">
              Objective
            </label>
            <input
              id="trial-objective"
              value={objective}
              onChange={(changeEvent) => setObjective(changeEvent.target.value)}
              placeholder="One sentence: what this trial sets out to show."
              className={inputClass}
            />
          </div>
          {error ? <ErrorState message={error} /> : null}
          <button
            type="submit"
            disabled={creating}
            className="min-h-11 w-full rounded-lg border border-primary px-4 py-2.5 font-medium text-primary disabled:opacity-60 dark:text-primary-soft"
          >
            {creating ? "Creating…" : "Create an empty trial"}
          </button>
        </form>
      </Card>
    </div>
  );
}
