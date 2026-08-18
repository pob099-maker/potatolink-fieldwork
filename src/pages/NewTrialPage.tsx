// Starting point for a new trial: import a filled-in template, or build one
// by hand. Both routes end in the same place — a trial with a setup checklist
// showing whatever is still missing.

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { addTrial } from "../services/store";
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
          Two ways in. Either lands on a trial page with a checklist of anything still to
          set up, so nothing is missed before the first entry.
        </p>
      </div>

      <Card>
        <h2 className="font-display text-lg font-bold">Import a template</h2>
        <p className="mt-1 text-sm text-ink/60 dark:text-ink-dark/60">
          Best when the protocol is already written. Fill in the template spreadsheet —
          one row per question — and the whole trial is created at once: every form, every
          screen, with the answers checked before it goes to the field. Download the blank
          template from the import page.
        </p>
        <Link
          to="/trials/import"
          className="mt-3 inline-block min-h-11 rounded-lg bg-primary px-4 py-2.5 font-medium text-white"
        >
          Import a trial from CSV
        </Link>
      </Card>

      <Card>
        <h2 className="font-display text-lg font-bold">Build it here</h2>
        <p className="mt-1 text-sm text-ink/60 dark:text-ink-dark/60">
          Best for a quick trial or when the protocol is still taking shape. Start with a
          name, then add sites, practices and questions on the trial page.
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
