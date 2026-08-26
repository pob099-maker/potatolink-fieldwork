import { describe, expect, it } from "vitest";
import { isBackendConfigured, supabase } from "./supabase";

// A canary, not a unit test.
//
// Vitest loads .env through Vite. With a .env.local present — which every
// developer working on the sync code has — VITE_SUPABASE_URL was set during
// the test run, the Supabase client was real, and every store function that
// mirrors a write to the cloud did exactly that. `npm test` put fourteen junk
// form templates into a live project, twice, before anyone noticed.
//
// vite.config.ts blanks those variables for the test environment. This fails
// the moment that stops being true, which is the only way to notice before a
// test suite starts editing somebody's data again.

describe("test isolation", () => {
  it("runs with no Supabase client", () => {
    expect(supabase).toBeNull();
  });

  it("reports the backend as unconfigured", () => {
    expect(isBackendConfigured()).toBe(false);
  });

  it("has no backend credentials in the environment", () => {
    expect(import.meta.env.VITE_SUPABASE_URL || "").toBe("");
    expect(import.meta.env.VITE_SUPABASE_ANON_KEY || "").toBe("");
  });
});
