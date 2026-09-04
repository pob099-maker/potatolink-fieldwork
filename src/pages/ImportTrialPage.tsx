import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  downloadReferenceTemplate,
  parseTemplateCsv,
  type ParsedTrial,
} from "../services/templateImport";
import { validateTemplate, type TemplateIssue } from "../services/templateValidate";
import { publishParsedTrial } from "../services/templatePublish";
import { words } from "../services/vocabulary";
import { Card, ErrorState, PageTitle } from "../components/ui";

export function ImportTrialPage() {
  const navigate = useNavigate();
  const [parsed, setParsed] = useState<ParsedTrial | null>(null);
  const [issues, setIssues] = useState<TemplateIssue[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const errors = issues.filter((issue) => issue.level === "error");
  const warnings = issues.filter((issue) => issue.level === "warning");

  async function onFile(file: File): Promise<void> {
    setParseError(null);
    setPublishError(null);
    setParsed(null);
    const text = await file.text();
    const result = parseTemplateCsv(text);
    if (!result.success) {
      setParseError(result.error);
      return;
    }
    setParsed(result.data);
    setIssues(validateTemplate(result.data));
  }

  async function onPublish(): Promise<void> {
    if (!parsed) return;
    setPublishing(true);
    setPublishError(null);
    const result = await publishParsedTrial(parsed);
    setPublishing(false);
    if (!result.success) {
      setPublishError(result.error);
      return;
    }
    navigate(`/trials/${result.data.trialId}`);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <PageTitle>Import a trial from CSV</PageTitle>
        <p className="mt-1 text-ink-soft">
          Upload a Fieldwork Template CSV and get a working trial — forms, screens, and
          validation — without any coding. New to the format? Start from the blank
          template: it opens in Excel or Google Sheets, one row per question.
        </p>
        <button
          type="button"
          onClick={() => downloadReferenceTemplate()}
          className="mt-3 min-h-11 rounded-lg border border-primary px-4 py-2.5 font-medium text-primary dark:text-primary-soft"
        >
          ⬇ Download blank template (CSV)
        </button>
      </div>

      <Card>
        <label htmlFor="template-file" className="block font-medium">
          Template file (.csv)
        </label>
        <input
          id="template-file"
          type="file"
          accept=".csv,text/csv"
          onChange={(changeEvent) => {
            const file = changeEvent.target.files?.[0];
            if (file) void onFile(file);
          }}
          className="mt-2 w-full text-sm file:mr-3 file:min-h-11 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2.5 file:font-medium file:text-white"
        />
        {parseError ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {parseError}
          </p>
        ) : null}
      </Card>

      {parsed ? (
        <>
          <Card>
            <h2 className="font-semibold">What will be created</h2>
            <p className="mt-1">
              <span className="font-medium">{parsed.name}</span>
              {parsed.design === "replicated"
                ? ` — replicated experiment, ${parsed.replicates} replicates`
                : " — observational"}
            </p>
            {parsed.objective ? (
              <p className="text-sm text-ink-soft">{parsed.objective}</p>
            ) : null}
            <p className="mt-2 flex flex-wrap gap-1 text-meta">
              {parsed.sites.map((site) => (
                <span
                  key={site.location}
                  className="rounded-full bg-accent/20 px-2 py-0.5 text-ink"
                >
                  📍 {site.location}
                </span>
              ))}
              {parsed.practices.map((practice) => (
                <span
                  key={practice.name}
                  className="rounded-full bg-primary/10 px-2 py-0.5 text-primary dark:bg-primary-soft/20 dark:text-primary-soft"
                >
                  {practice.name}
                  {practice.type === "control" ? " (control)" : ""}
                </span>
              ))}
            </p>
            <ul className="mt-3 divide-y divide-line">
              {parsed.forms.map((form) => (
                <li key={form.name} className="py-2">
                  <span className="font-medium">{form.name}</span>
                  <span className="block text-meta text-ink-soft">
                    {form.fields.length} {form.fields.length === 1 ? "thing recorded" : "things recorded"} ·
                    filled in by {form.audience}
                    {form.frequency ? ` · ${form.frequency}` : ""}
                    {form.requiresSite ? " · per site" : " · whole trial"}
                    {form.requiresArm
                      ? ` · per ${words({ vocabulary: null, design: parsed.design }).one}`
                      : ""}
                    {form.commerciallySensitive ? " · commercially sensitive" : ""}
                  </span>
                  {/* Said here because this is the last screen before the
                      trial exists. Grouping changes how every treatment mean
                      on this form is worked out, and a sum is a question
                      nobody in the paddock has to answer — both are worth
                      seeing before the file is accepted, not discovered
                      afterwards. */}
                  {form.groupsBy ? (
                    <span className="mt-0.5 block text-meta text-ink-soft">
                      Several samples can share one {form.groupsBy} — those are averaged
                      together rather than counted separately.
                    </span>
                  ) : null}
                  {form.fields.some((field) => field.isResponse) ? (
                    <span className="mt-0.5 block text-meta text-ink-soft">
                      ★ is the number this trial turns on — what the treatment means
                      are worked out from.
                    </span>
                  ) : null}
                  {form.fields.some((field) => field.formula) ? (
                    <span className="mt-0.5 block text-meta text-ink-soft">
                      Worked out from the other answers:{" "}
                      {form.fields
                        .filter((field) => field.formula)
                        .map((field) => field.label)
                        .join(", ")}
                      .
                    </span>
                  ) : null}
                  <ul className="mt-1 flex flex-wrap gap-1">
                    {form.fields.map((field) => (
                      <li
                        key={field.fieldName}
                        className="rounded-full bg-primary/10 px-2 py-0.5 text-meta text-primary dark:bg-primary-soft/20 dark:text-primary-soft"
                      >
                        {field.label}
                        {field.isResponse ? " ★" : ""}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </Card>

          {issues.length > 0 ? (
            <Card>
              <h2 className="font-semibold">
                Checks — {errors.length} {errors.length === 1 ? "error" : "errors"},{" "}
                {warnings.length} {warnings.length === 1 ? "warning" : "warnings"}
              </h2>
              <ul className="mt-2 space-y-1 text-sm">
                {issues.map((issue, index) => (
                  <li
                    key={index}
                    className={issue.level === "error" ? "text-danger" : "text-warning"}
                  >
                    {issue.level === "error" ? "✕" : "⚠"} {issue.message}
                    {issue.row ? ` (row ${issue.row})` : ""}
                  </li>
                ))}
              </ul>
            </Card>
          ) : (
            <p
              role="status"
              className="rounded-lg bg-success/10 p-3 text-sm font-medium text-success"
            >
              All checks passed.
            </p>
          )}

          {publishError ? <ErrorState message={publishError} /> : null}

          <div className="flex gap-2">
            <Link
              to="/"
              className="min-h-11 flex-1 rounded-lg border border-line-strong px-4 py-2.5 text-center font-medium"
            >
              Cancel
            </Link>
            <button
              type="button"
              disabled={errors.length > 0 || publishing}
              onClick={() => void onPublish()}
              className="min-h-11 flex-1 rounded-lg bg-primary px-4 py-2.5 font-medium text-white disabled:opacity-50"
            >
              {publishing
                ? "Creating…"
                : warnings.length > 0
                  ? "Create trial anyway"
                  : "Create trial"}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
