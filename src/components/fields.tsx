// Field renderers for FormTemplate-driven forms. Trial-specific field names
// are never hardcoded here — everything comes from the template config.

import { useRef, useState } from "react";
import type { Control, FieldValues, Path, UseFormRegister } from "react-hook-form";
import { Controller } from "react-hook-form";
import type { FormField } from "../types";

const inputClass =
  "w-full min-h-11 rounded-lg border border-ink/20 bg-surface px-3 py-2.5 text-base " +
  "focus:border-primary focus:outline-none dark:border-ink-dark/20 dark:bg-surface-dark";

interface FieldProps<T extends FieldValues> {
  field: FormField;
  register: UseFormRegister<T>;
  control: Control<T>;
  error: string | undefined;
}

export function EntryField<T extends FieldValues>({ field, register, control, error }: FieldProps<T>) {
  const labelId = `label-${field.fieldName}`;

  return (
    <div>
      <label id={labelId} htmlFor={field.fieldName} className="mb-1.5 block font-medium">
        {field.label}
        {field.unit ? <span className="text-ink/50 dark:text-ink-dark/50"> ({field.unit})</span> : null}
        {field.required ? <span aria-hidden className="text-danger"> *</span> : null}
      </label>
      <FieldInput field={field} register={register} control={control} labelId={labelId} />
      {error ? (
        <p role="alert" className="mt-1 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function FieldInput<T extends FieldValues>({
  field,
  register,
  control,
  labelId,
}: {
  field: FormField;
  register: UseFormRegister<T>;
  control: Control<T>;
  labelId: string;
}) {
  const name = field.fieldName as Path<T>;

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
          {...register(name)}
        />
      );
    case "date":
      return <input id={field.fieldName} type="date" className={inputClass} {...register(name)} />;
    case "text":
      return (
        <textarea id={field.fieldName} rows={3} className={inputClass} {...register(name)} />
      );
    case "select":
      return (
        <select id={field.fieldName} className={inputClass} {...register(name)} defaultValue="">
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
                      : "border-ink/20 dark:border-ink-dark/20"
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
              <div className="flex justify-between text-sm text-ink/50 dark:text-ink-dark/50">
                <span>{field.min ?? 1} — poor</span>
                <span className="font-semibold text-ink dark:text-ink-dark">
                  {typeof controller.value === "number" ? controller.value : "–"}
                </span>
                <span>{field.max ?? 5} — great</span>
              </div>
            </div>
          )}
        />
      );
    case "photo":
      return <PhotoInput control={control} name={name} fieldId={field.fieldName} />;
  }
}

function PhotoInput<T extends FieldValues>({
  control,
  name,
  fieldId,
}: {
  control: Control<T>;
  name: Path<T>;
  fieldId: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: controller }) => (
        <div>
          <input
            ref={fileRef}
            id={fieldId}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(changeEvent) => {
              const file = changeEvent.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                controller.onChange(typeof reader.result === "string" ? reader.result : "");
                setFileName(file.name);
              };
              reader.readAsDataURL(file);
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="min-h-11 w-full rounded-lg border border-dashed border-ink/30 px-4 py-2.5 font-medium text-ink/70 dark:border-ink-dark/30 dark:text-ink-dark/70"
          >
            📷 {fileName ? `Photo added (${fileName})` : "Take or choose a photo"}
          </button>
          {typeof controller.value === "string" && controller.value ? (
            <img
              src={controller.value}
              alt="Preview of the captured photo"
              className="mt-2 max-h-40 rounded-lg"
            />
          ) : null}
        </div>
      )}
    />
  );
}
