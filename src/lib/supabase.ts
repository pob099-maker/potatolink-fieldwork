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
