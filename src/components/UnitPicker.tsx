// Choosing a unit rather than spelling one.
//
// The escape hatch is deliberate and deliberately second. A list that cannot
// be escaped would block a trial measuring something nobody anticipated, which
// is a worse failure than an odd unit — but a blank box offered first is how
// every trial invents its own spelling and the yield conversion quietly stops
// working. So: the list, then "something else".
//
// What a unit unlocks is said beside the choice, not discovered later from the
// absence of a column.

import { useState } from "react";
import { canonicalUnit, describePower, isKnownUnit, unitGroups } from "../services/units";

const OTHER = "__other__";

const inputClass = "min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3 py-2";

export function UnitPicker({
  value,
  onChange,
  label = "Unit",
  ariaLabel,
  id,
}: {
  value: string;
  onChange: (unit: string) => void;
  label?: string;
  /**
   * What assistive technology hears, when the visible label is short because
   * something nearby already gives the context. "Unit" is enough to read next
   * to a heading that says Item 2; it is not enough heard on its own, six
   * times down a form.
   */
  ariaLabel?: string;
  /** Ties the label to the control when this sits outside its own <label>. */
  id?: string;
}) {
  // A unit already stored that the list does not hold — an import, or an older
  // trial — opens in the free-text state rather than silently becoming
  // something else.
  const [custom, setCustom] = useState(() => value !== "" && !isKnownUnit(value));

  const power = describePower(value);

  return (
    <div>
      <label className="block text-sm font-medium" htmlFor={id}>
        {label}
        <select
          id={id}
          aria-label={ariaLabel}
          value={custom ? OTHER : value}
          onChange={(event) => {
            if (event.target.value === OTHER) {
              setCustom(true);
              onChange("");
              return;
            }
            setCustom(false);
            onChange(event.target.value);
          }}
          className={inputClass}
        >
          <option value="">No unit</option>
          {unitGroups().map(({ group, options }) => (
            <optgroup key={group} label={group}>
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </optgroup>
          ))}
          <option value={OTHER}>Something else…</option>
        </select>
      </label>

      {custom ? (
        <input
          value={value}
          aria-label={`${ariaLabel ?? label} — type your own`}
          placeholder="e.g. brix, bushels/acre"
          // Tidied on the way out, not on every keystroke: correcting a unit
          // while somebody is still typing it fights them for the field.
          onChange={(event) => onChange(event.target.value)}
          onBlur={(event) => {
            const tidied = canonicalUnit(event.target.value);
            onChange(tidied);
            // Somebody who typed "kilograms" has chosen kg, and the control
            // should show them that. Leaving the free-text box open with their
            // own spelling in it, while a different value is what gets saved,
            // is the silent substitution this component exists to prevent.
            if (tidied && isKnownUnit(tidied)) setCustom(false);
          }}
          className={`${inputClass} mt-2`}
        />
      ) : null}

      {power ? (
        <p className="mt-1 text-sm font-normal text-ink-soft">{power}</p>
      ) : null}
    </div>
  );
}
