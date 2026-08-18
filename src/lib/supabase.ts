import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Supabase client, or null when the env vars are not set. The app is fully
 * usable offline without it; the sync engine simply holds entries as
 * "pending" until a backend is configured.
 */
export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;

export function isBackendConfigured(): boolean {
  return supabase !== null;
}

/** Map a camelCase record to the snake_case columns used in Postgres. */
export function toRow(record: object): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    const column = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    row[column] = value;
  }
  return row;
}

// Matches full ISO timestamps (with a time part), not plain dates like a
// grower's "2026-08-18" answer — those must pass through untouched.
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/**
 * Map a snake_case Postgres row back to a camelCase record. Top-level keys
 * only — jsonb payloads (template fields, coordinates) are already camelCase.
 * Timestamps are normalised to UTC "Z" form so string sorting stays correct
 * alongside locally-created records.
 */
export function fromRow(row: Record<string, unknown>): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const [column, value] of Object.entries(row)) {
    const key = column.replace(/_([a-z0-9])/g, (_, letter: string) => letter.toUpperCase());
    record[key] =
      typeof value === "string" && ISO_TIMESTAMP.test(value)
        ? new Date(value).toISOString()
        : value;
  }
  return record;
}
