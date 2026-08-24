// Starting point for a new trial: answer questions, or import a filled-in
// template. Both routes end in the same place — a trial with a setup checklist
// showing whatever is still missing.
//
// There used to be a third, "Build it here", which made a bare trial to
// furnish card by card. The wizard does that and asks the questions, so
// keeping it meant three choices where the honest count is two, and the
// difference between two of them was hard to explain.

import { Link } from "react-router-dom";
import { downloadReferenceTemplate } from "../services/templateImport";
import { Card, PageTitle } from "../components/ui";

export function NewTrialPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <PageTitle>Start a new trial</PageTitle>
        <p className="mt-1 text-ink/60 dark:text-ink-dark/60">
          Two ways in, both landing on the same trial page with a checklist of anything
          still to set up.
        </p>
      </div>

      <Card className="border-accent/50">
        <h2 className="font-display text-lg font-bold">Answer a few questions</h2>
        <p className="mt-1 text-sm text-ink/60 dark:text-ink-dark/60">
          Suits both ends. A grower comparing two practices is finished in four short
          screens; anybody who already has the brief can show every question at once and
          fill them in one pass. You end up with a trial you can record against — the
          site, what is being compared, and the questions asked in the field.
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
          For a protocol that already lives in a spreadsheet, or a trial with more
          questions than you would want to type one at a time. The template covers the
          whole trial in one file — every site, practice and question — and is checked
          before anything is created.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => downloadReferenceTemplate()}
            className="min-h-11 rounded-lg border border-primary px-4 py-2.5 font-medium text-primary dark:text-primary-soft"
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
    </div>
  );
}
