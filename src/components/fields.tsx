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
      <FieldInput
        field={field}
        register={register}
        control={control}
        labelId={labelId}
        required={field.required}
        invalid={Boolean(error)}
        describedBy={error ? errorId : undefined}
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

function FieldInput<T extends FieldValues>({
  field,
  register,
  control,
  labelId,
  required,
  invalid,
  describedBy,
}: {
  field: FormField;
  register: UseFormRegister<T>;
  control: Control<T>;
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
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="min-h-11 w-full rounded-lg border border-dashed border-line-strong px-4 py-2.5 font-medium text-ink-soft"
            >
              {kind === "video"
                ? `🎬 ${hasMedia ? "Video added — tap to replace" : "Record or choose a video"}`
                : kind === "photo"
                  ? `📷 ${hasMedia ? "Photo added — tap to replace" : "Take or choose a photo"}`
                  : `📎 ${hasMedia ? "File attached — tap to replace" : "Attach a file"}`}
            </button>
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
