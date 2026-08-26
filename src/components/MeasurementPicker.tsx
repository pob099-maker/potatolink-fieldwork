// Picking something to record, instead of describing it from scratch.
//
// The convenience is that choosing "Marketable yield" fills in the type, the
// unit and sensible bounds, so nobody has to decide whether yield is measured
// in kg or t/ha at the moment they are trying to think about a trial.
//
// The reason it exists is the other one. Three trials that all choose
// marketableYield in kilograms can be pooled next season; three that typed
// "Yield", "yield t/ha" and "Marketable wt" never can, and nobody finds out
// until somebody tries. A shared list is the cheapest way to make the first
// outcome the default one.
//
// It is a starting point, not a gate. "Something else" is always at the
// bottom and behaves exactly as typing did before — and what gets typed is
// offered to the next person, so the list grows into whatever this programme
// actually measures.

import { useMemo, useState } from "react";
import { useLibrary } from "../hooks/useCollections";
import {
  isBuiltIn,
  libraryEntries,
  rankEntries,
  type LibraryEntry,
} from "../services/measurementLibrary";

const inputClass =
  "min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3 py-2";

/** How a measurement reads in the list: name, then what it produces. */
function describe(entry: LibraryEntry): string {
  const parts: string[] = [];
  if (entry.unit) parts.push(entry.unit);
  if (entry.type === "slider" && entry.min !== null && entry.max !== null) {
    parts.push(`${entry.min}–${entry.max}`);
  } else if (entry.type !== "number") {
    parts.push(TYPE_WORDS[entry.type] ?? entry.type);
  }
  return parts.join(" · ");
}

const TYPE_WORDS: Record<string, string> = {
  text: "written notes",
  select: "pick from a list",
  multiselect: "pick any that apply",
  slider: "rating",
  photo: "photo",
  video: "video",
  file: "file",
  gps: "location",
  date: "date",
  boolean: "yes or no",
};

export function MeasurementPicker({
  onPick,
  onFreeText,
  onCancel,
}: {
  onPick: (entry: LibraryEntry) => void;
  /** Chosen "something else" — behaves exactly as typing always did. */
  onFreeText: () => void;
  onCancel: () => void;
}) {
  const library = useLibrary();
  const [search, setSearch] = useState("");

  const entries = useMemo(
    () => rankEntries(libraryEntries(library.data ?? []), search),
    [library.data, search],
  );

  return (
    <div className="rounded-lg border border-line p-3">
      <label className="block text-sm font-medium">
        What are you recording?
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search, or pick from the list"
          autoFocus
          className={`mt-1 ${inputClass}`}
        />
      </label>

      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">
          Nothing in the list matches “{search}”. Add it as your own and it will be here
          for the next trial.
        </p>
      ) : (
        <ul className="mt-3 max-h-72 divide-y divide-line overflow-y-auto">
          {entries.map((entry) => (
            <li key={entry.entryId}>
              <button
                type="button"
                onClick={() => onPick(entry)}
                className="flex min-h-11 w-full flex-wrap items-baseline gap-x-2 py-2.5 text-left"
              >
                <span className="font-medium">{entry.label}</span>
                {describe(entry) ? (
                  <span className="text-meta text-ink-faint">{describe(entry)}</span>
                ) : null}
                {/* Somebody added this on another trial. Worth saying, so a
                    local habit is not mistaken for a standard. */}
                {!isBuiltIn(entry) ? (
                  <span className="rounded-full bg-accent/25 px-2 py-0.5 text-meta">
                    added here
                  </span>
                ) : null}
                {entry.guidance ? (
                  <span className="block w-full text-sm text-ink-soft">{entry.guidance}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onFreeText}
          className="min-h-11 flex-1 rounded-lg border border-dashed border-line-strong px-4 py-2.5 font-medium text-ink-soft"
        >
          Something else
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded-lg border border-line-strong px-4 py-2.5 font-medium"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
