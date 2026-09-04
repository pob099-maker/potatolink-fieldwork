// Field renderers for FormTemplate-driven forms. Trial-specific field names
// are never hardcoded here — everything comes from the template config.

import { useEffect, useRef, useState } from "react";
import type {
  Control,
  FieldValues,
  Path,
  PathValue,
  UseFormRegister,
  UseFormSetValue,
} from "react-hook-form";
import { Controller, useWatch } from "react-hook-form";
import { evaluateFormula, parseFormula } from "../services/formula";
import { getMedia, isMediaPointer, mediaIdFromPointer, saveMedia } from "../services/media";
import { areaUnit, weightUnit, yieldPerHectare } from "../services/plotArea";
import { accuracyNote, stripArea, type Fix } from "../services/stripMeasure";
import type { FormField, MediaKind } from "../types";

const inputClass =
  "w-full min-h-11 rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-base " +
  "focus:border-primary";

interface FieldProps<T extends FieldValues> {
  field: FormField;
  register: UseFormRegister<T>;
  control: Control<T>;
  error: string | undefined;
  /** The plot's area in square metres, when the trial records one. */
  plotAreaM2?: number | null;
  /** The working width, for measuring a strip by walking its length. */
  plotWidthM?: number | null;
  /**
   * Needed to fill a measured area in. The number inputs are registered
   * uncontrolled, so writing through a Controller updates form state while
   * leaving the box on screen empty — setValue writes to both.
   */
  setValue?: UseFormSetValue<T>;
}

export function EntryField<T extends FieldValues>({
  field,
  register,
  control,
  error,
  plotAreaM2 = null,
  plotWidthM = null,
  setValue,
}: FieldProps<T>) {
  const labelId = `label-${field.fieldName}`;
  const errorId = `${field.fieldName}-error`;
  const guidanceId = `${field.fieldName}-guidance`;
  // Both, when both exist. A note read out as part of the field is the whole
  // point of writing it — guidance that is only visible helps everybody except
  // the person who cannot see it.
  const describedBy =
    [field.guidance ? guidanceId : null, error ? errorId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div>
      <label id={labelId} htmlFor={field.fieldName} className="mb-1.5 block font-medium">
        {field.label}
        {field.unit ? <span className="text-ink-faint"> ({field.unit})</span> : null}
        {/* The asterisk is decoration — hidden from assistive technology, and
            the only thing that said "required". Without aria-required a screen
            reader user filled in what they thought was needed and met a
            validation error they had no way to see coming. */}
        {field.required ? <span aria-hidden className="text-danger"> *</span> : null}
      </label>
      {/* Under the label, above the control, and always visible.
          Behind a tap it would be hidden from exactly the person it was
          written for — somebody who does not yet know they need it. A hover
          tooltip is worse still: a phone has no hover, so it degrades to
          tap-to-reveal on the one device this app is built for. */}
      {field.guidance ? (
        <p id={guidanceId} className="mb-1 text-sm text-ink-soft">
          {field.guidance}
        </p>
      ) : null}
      <FieldInput
        field={field}
        register={register}
        control={control}
        setValue={setValue}
        labelId={labelId}
        required={field.required}
        invalid={Boolean(error)}
        describedBy={describedBy}
      />
      <StripMeasure field={field} widthM={plotWidthM} setValue={setValue} />
      <YieldHint field={field} control={control} plotAreaM2={plotAreaM2} />
      {error ? (
        <p id={errorId} role="alert" className="mt-1 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Fills in a strip's area by walking it: mark one end, drive to the other,
 * mark again.
 *
 * Only the length is measured. The width is the machine's and is already
 * recorded on the trial, which is what makes this worth doing at all — four
 * corners of a small plot would carry more error than the plot has area, but
 * five metres of uncertainty on an eight hundred metre run is under a percent.
 *
 * Whatever the device claims for accuracy is shown rather than swallowed, and
 * a reading too rough to use says so instead of quietly landing in the file.
 */
function StripMeasure<T extends FieldValues>({
  field,
  widthM,
  setValue,
}: {
  field: FormField;
  widthM: number | null;
  setValue: UseFormSetValue<T> | undefined;
}) {
  const unit = areaUnit(field.unit);
  const [start, setStart] = useState<Fix | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  if (!unit || field.type !== "number" || !setValue) return null;

  function locate(): Promise<Fix> {
    return new Promise((resolve, reject) => {
      if (!("geolocation" in navigator)) {
        reject(new Error("This device can't provide a location."));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) =>
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracyM: position.coords.accuracy,
          }),
        () => reject(new Error("Couldn't get a location. Check location permission.")),
        { enableHighAccuracy: true, timeout: 20_000 },
      );
    });
  }

  async function mark(): Promise<void> {
    setNote(null);
    setBusy(true);
    try {
      const fix = await locate();
      if (!start) {
        setStart(fix);
        return;
      }
      const measured = stripArea(start, fix, widthM as number);
      setStart(null);
      if (!measured) {
        setNote(
          "That is too short to be a strip — the two ends are within the device's own margin of error.",
        );
        return;
      }
      const accuracy = accuracyNote(measured);
      if (accuracy.level === "poor") {
        setNote(accuracy.message);
        return;
      }
      const area = unit === "ha" ? measured.areaHa : measured.areaM2;
      setValue!(
        field.fieldName as Path<T>,
        Number(area.toFixed(unit === "ha" ? 3 : 0)) as PathValue<T, Path<T>>,
        { shouldValidate: true, shouldDirty: true },
      );
      setNote(`${measured.lengthM.toFixed(0)} m × ${widthM} m — ${accuracy.message}`);
    } catch (caught) {
      setNote(caught instanceof Error ? caught.message : "Couldn't get a location.");
    } finally {
      setBusy(false);
    }
  }

  if (widthM === null) {
    return (
      <p className="mt-1 text-sm text-ink-faint">
        Set the plot width on the trial and this can be measured by walking the strip
        instead of typed.
      </p>
    );
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void mark()}
        className="min-h-11 w-full rounded-lg border border-dashed border-line-strong px-4 py-2.5 font-medium text-ink-soft disabled:opacity-60"
      >
        📍{" "}
        {busy
          ? "Getting a fix…"
          : start
            ? "At the far end — mark the finish"
            : `Measure by walking (${widthM} m wide)`}
      </button>
      {note ? (
        <p role="status" className="mt-1 text-sm text-ink-soft">
          {note}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Shows what a weight works out to per hectare, live, while it is being typed.
 *
 * The point is not convenience. A form that asks for tonnes per hectare asks
 * somebody in a paddock to convert kilograms off a plot, and a misplaced
 * decimal in that sum is invisible for the rest of the trial. Showing the
 * result as they type turns a silent arithmetic error into an obviously wrong
 * number on screen.
 */
/** The area a conversion used, said the way the person would say it. */
function areaLabel(areaM2: number): string {
  return areaM2 >= 1_000
    ? `${(areaM2 / 10_000).toFixed(2)} ha`
    : `${Math.round(areaM2)} m²`;
}

function YieldHint<T extends FieldValues>({
  field,
  control,
  plotAreaM2,
}: {
  field: FormField;
  control: Control<T>;
  plotAreaM2: number | null;
}) {
  const unit = weightUnit(field.unit);
  const value = useWatch({ control, name: field.fieldName as Path<T> });
  if (!unit || plotAreaM2 === null) return null;
  const weight = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(weight) || weight <= 0) return null;
  const perHectare = yieldPerHectare(weight, unit, plotAreaM2);
  if (perHectare === null) return null;
  return (
    <p className="mt-1 text-sm text-ink-soft">
      ≈ <span className="font-medium">{perHectare.toFixed(1)} t/ha</span> over{" "}
      {areaLabel(plotAreaM2)}
    </p>
  );
}

/**
 * A number worked out from the other answers, rather than typed.
 *
 * Read-only on purpose. A box somebody can type into and the app can also
 * write to is a box that fights whoever is using it, and the moment they
 * disagree there is no telling which number was meant. If the figure looks
 * wrong the input is wrong, and that is where the correction belongs.
 *
 * Blank until every input it reads has a value — shown as a dash with the
 * reason, not as 0. Rule 13 is what happens when a blank becomes a number.
 */
function ComputedNumber<T extends FieldValues>({
  field,
  control,
  setValue,
  describedBy,
}: {
  field: FormField;
  control: Control<T>;
  setValue: UseFormSetValue<T>;
  describedBy: string | undefined;
}) {
  const parsed = parseFormula(field.formula ?? "");
  const names = parsed.ok ? parsed.formula.names : [];
  // Watching only what the sum reads, so a long form does not re-render every
  // computed field on every keystroke anywhere in it.
  const watched = useWatch({ control, name: names as unknown as Path<T>[] }) as unknown[];
  const values: Record<string, unknown> = {};
  names.forEach((name, index) => {
    values[name] = watched?.[index];
  });
  const value = parsed.ok ? evaluateFormula(parsed.formula, values) : null;

  // Written into form state so it saves, exports and compares like anything
  // else — and so a second sum can read this one.
  useEffect(() => {
    setValue(
      field.fieldName as Path<T>,
      (value === null ? "" : value) as PathValue<T, Path<T>>,
      { shouldDirty: false },
    );
  }, [value, field.fieldName, setValue]);

  const shown =
    value === null
      ? null
      : // Enough places to be useful, no more than the inputs justify.
        Number(value.toFixed(2)).toString();

  return (
    <div>
      <output
        id={field.fieldName}
        htmlFor={names.join(" ")}
        aria-describedby={describedBy}
        className="block min-h-11 rounded-lg border border-line bg-sunk px-3 py-2.5 text-base tabular-nums"
      >
        {shown ?? <span className="text-ink-faint">—</span>}
      </output>
      <p className="mt-1 text-sm text-ink-soft">
        {!parsed.ok
          ? `This is worked out automatically, but the sum has a problem: ${parsed.error}`
          : shown === null
            ? "Worked out automatically once the answers above are filled in."
            : "Worked out automatically from the answers above."}
      </p>
    </div>
  );
}

function FieldInput<T extends FieldValues>({
  field,
  register,
  control,
  setValue,
  labelId,
  required,
  invalid,
  describedBy,
}: {
  field: FormField;
  register: UseFormRegister<T>;
  control: Control<T>;
  setValue: UseFormSetValue<T> | undefined;
  labelId: string;
  required: boolean;
  invalid: boolean;
  describedBy: string | undefined;
}) {
  const name = field.fieldName as Path<T>;
  // Carried on every control that takes typed input, so the state a sighted
  // user reads from an asterisk and a red message is available to everyone.
  const aria = {
    "aria-required": required || undefined,
    "aria-invalid": invalid || undefined,
    "aria-describedby": describedBy,
  };

  // A worked-out number is still a number everywhere else — same unit, same
  // storage, same column in the export. The only difference is that nobody
  // types it, so the branch sits here rather than in the type list.
  if (field.type === "number" && field.formula?.trim() && setValue) {
    return (
      <ComputedNumber
        field={field}
        control={control}
        setValue={setValue}
        describedBy={describedBy}
      />
    );
  }

  switch (field.type) {
    case "number":
      return (
        <input
          id={field.fieldName}
          type="number"
          inputMode="decimal"
          step="any"
          min={field.min ?? undefined}
          max={field.max ?? undefined}
          className={inputClass}
          {...aria}
          {...register(name)}
        />
      );
    case "date":
      return (
        <input
          id={field.fieldName}
          type="date"
          className={inputClass}
          {...aria}
          {...register(name)}
        />
      );
    case "text":
      return (
        <textarea
          id={field.fieldName}
          rows={3}
          className={inputClass}
          {...aria}
          {...register(name)}
        />
      );
    case "link":
      return (
        <div>
          {/* inputMode gives the phone keyboard its slash and .com; type stays
              "text" on purpose. type="url" hands validation to the browser,
              which intercepts the submit with its own vague popup ("Please
              enter a URL"), never runs the Zod rule, and sets no aria-invalid
              — so the message is worse, it is not in the page like every other
              error in this app, and a screen reader hears nothing at all.

              Nothing here fetches anything: a link is text until somebody taps
              it, so this works with no signal like the rest of the form. */}
          <input
            id={field.fieldName}
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://"
            className={inputClass}
            {...aria}
            {...register(name)}
          />
          <p className="mt-1 text-meta text-ink-faint">
            A lab result, a contractor&apos;s report, a shared folder. Paste the whole
            address.
          </p>
        </div>
      );
    case "select":
      return (
        <select
          id={field.fieldName}
          className={inputClass}
          {...aria}
          {...register(name)}
          defaultValue=""
        >
          <option value="">Choose one…</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    case "boolean":
      return (
        <Controller
          control={control}
          name={name}
          render={({ field: controller }) => (
            <div role="radiogroup" aria-labelledby={labelId} className="flex gap-2">
              {[
                { label: "Yes", value: true },
                { label: "No", value: false },
              ].map((choice) => (
                <button
                  key={choice.label}
                  type="button"
                  role="radio"
                  aria-checked={controller.value === choice.value}
                  onClick={() => controller.onChange(choice.value)}
                  className={`min-h-11 flex-1 rounded-lg border px-4 py-2.5 font-medium ${
                    controller.value === choice.value
                      ? "border-primary bg-primary text-white"
                      : "border-line-strong"
                  }`}
                >
                  {choice.label}
                </button>
              ))}
            </div>
          )}
        />
      );
    case "slider":
      return (
        <Controller
          control={control}
          name={name}
          render={({ field: controller }) => (
            <div>
              <input
                id={field.fieldName}
                type="range"
                min={field.min ?? 1}
                max={field.max ?? 5}
                step={1}
                value={typeof controller.value === "number" ? controller.value : field.min ?? 1}
                onChange={(changeEvent) => controller.onChange(Number(changeEvent.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-sm text-ink-faint">
                <span>{field.min ?? 1} — poor</span>
                <span className="font-semibold text-ink">
                  {typeof controller.value === "number" ? controller.value : "–"}
                </span>
                <span>{field.max ?? 5} — great</span>
              </div>
            </div>
          )}
        />
      );
    case "photo":
    case "video":
    case "file":
      return (
        <MediaInput control={control} name={name} fieldId={field.fieldName} kind={field.type} />
      );
    case "multiselect":
      return (
        <Controller
          control={control}
          name={name}
          render={({ field: controller }) => {
            const selected: string[] = Array.isArray(controller.value) ? controller.value : [];
            return (
              <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-2">
                {(field.options ?? []).map((option) => {
                  const isOn = selected.includes(option);
                  return (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={isOn}
                      onClick={() =>
                        controller.onChange(
                          isOn
                            ? selected.filter((current) => current !== option)
                            : [...selected, option],
                        )
                      }
                      className={`min-h-11 rounded-full border px-4 py-2 font-medium ${
                        isOn
                          ? "border-primary bg-primary text-white"
                          : "border-line-strong"
                      }`}
                    >
                      {isOn ? "✓ " : ""}
                      {option}
                    </button>
                  );
                })}
              </div>
            );
          }}
        />
      );
    case "gps":
      return <GpsInput control={control} name={name} />;
  }
}

function GpsInput<T extends FieldValues>({
  control,
  name,
}: {
  control: Control<T>;
  name: Path<T>;
}) {
  const [busy, setBusy] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: controller }) => {
        const captured = typeof controller.value === "string" && controller.value !== "";
        return (
          <div>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setGpsError(null);
                if (!("geolocation" in navigator)) {
                  setGpsError("This device can't provide a location.");
                  return;
                }
                setBusy(true);
                navigator.geolocation.getCurrentPosition(
                  (position) => {
                    controller.onChange(
                      `${position.coords.latitude.toFixed(6)},${position.coords.longitude.toFixed(6)}`,
                    );
                    setBusy(false);
                  },
                  () => {
                    setGpsError(
                      "Couldn't get a location. Check location permission and try again.",
                    );
                    setBusy(false);
                  },
                  { enableHighAccuracy: true, timeout: 15_000 },
                );
              }}
              className="min-h-11 w-full rounded-lg border border-dashed border-line-strong px-4 py-2.5 font-medium text-ink-soft disabled:opacity-60"
            >
              📍 {busy ? "Getting location…" : captured ? "Location captured — tap to update" : "Capture this location"}
            </button>
            {captured ? (
              <p className="mt-1 text-sm text-ink-soft">
                {String(controller.value)}
              </p>
            ) : null}
            {gpsError ? (
              <p role="alert" className="mt-1 text-sm text-danger">
                {gpsError}
              </p>
            ) : null}
          </div>
        );
      }}
    />
  );
}

function MediaInput<T extends FieldValues>({
  control,
  name,
  fieldId,
  kind,
}: {
  control: Control<T>;
  name: Path<T>;
  fieldId: string;
  kind: MediaKind;
}) {
  const watched = useWatch({ control, name });
  const pointer = typeof watched === "string" ? watched : null;
  const fileRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Restoring a saved photo used to happen in the middle of render, which set
  // state during a render pass and minted a fresh object URL on every one of
  // them until it settled. An effect keyed on the pointer runs once.
  useEffect(() => {
    if (!pointer || !isMediaPointer(pointer)) return;
    let live = true;
    void getMedia(mediaIdFromPointer(pointer)).then((item) => {
      if (live && item) setPreviewUrl(URL.createObjectURL(item.blob));
    });
    return () => {
      live = false;
    };
  }, [pointer]);

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: controller }) => {
        async function onFilePicked(file: File): Promise<void> {
          setCaptureError(null);
          const result = await saveMedia(file, kind);
          if (!result.success) {
            setCaptureError(result.error);
            return;
          }
          controller.onChange(result.data);
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          setPreviewUrl(URL.createObjectURL(file));
        }

        const hasMedia =
          typeof controller.value === "string" && isMediaPointer(controller.value);

        return (
          <div>
            <input
              ref={fileRef}
              id={fieldId}
              type="file"
              accept={kind === "video" ? "video/*" : kind === "photo" ? "image/*" : undefined}
              capture={kind === "file" ? undefined : "environment"}
              className="sr-only"
              onChange={(changeEvent) => {
                const file = changeEvent.target.files?.[0];
                if (file) void onFilePicked(file);
              }}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="min-h-11 flex-1 rounded-lg border border-dashed border-line-strong px-4 py-2.5 font-medium text-ink-soft"
              >
                {kind === "video"
                  ? `🎬 ${hasMedia ? "Video added — tap to replace" : "Record or choose a video"}`
                  : kind === "photo"
                    ? `📷 ${hasMedia ? "Photo added — tap to replace" : "Take or choose a photo"}`
                    : `📎 ${hasMedia ? "File attached — tap to replace" : "Attach a file"}`}
              </button>
              {/* Replace was the only way out, which is no way out at all for
                  a photograph taken by accident in a pocket: the choice was
                  another wrong photograph or a wrong one left in place. On an
                  optional field there was no way back to empty.

                  Only offered once something is there, so it never sits on
                  screen as a control with nothing to do. */}
              {hasMedia ? (
                <button
                  type="button"
                  onClick={() => {
                    controller.onChange("");
                    if (previewUrl) URL.revokeObjectURL(previewUrl);
                    setPreviewUrl(null);
                    setCaptureError(null);
                    // The input keeps the old filename otherwise, so choosing
                    // the same picture again would fire no change event and
                    // look broken.
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                  aria-label={`Remove this ${kind}`}
                  className="min-h-11 rounded-lg border border-line-strong px-4 py-2.5 font-medium text-danger"
                >
                  Remove
                </button>
              ) : null}
            </div>
            {kind === "video" ? (
              <p className="mt-1 text-meta text-ink-faint">
                Keep clips short — under about a minute uploads best from the paddock.
              </p>
            ) : null}
            {kind === "file" ? (
              <p className="mt-1 text-meta text-ink-faint">
                CSV exports, PDFs, spreadsheets — up to 25 MB.
              </p>
            ) : null}
            {captureError ? (
              <p role="alert" className="mt-1 text-sm text-danger">
                {captureError}
              </p>
            ) : null}
            {previewUrl && hasMedia && kind !== "file" ? (
              kind === "video" ? (
                <video src={previewUrl} controls className="mt-2 max-h-48 w-full rounded-lg" />
              ) : (
                <img
                  src={previewUrl}
                  alt="Preview of the captured photo"
                  className="mt-2 max-h-40 rounded-lg"
                />
              )
            ) : null}
          </div>
        );
      }}
    />
  );
}
