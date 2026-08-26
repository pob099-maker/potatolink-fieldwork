import { defineConfig, type Plugin } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Emits `sw.js` with the real build output baked into it.
 *
 * A service worker written by hand cannot know the filenames it has to cache,
 * because Vite puts a content hash in every one of them. Guessing with a
 * wildcard at runtime means the first offline visit finds an empty cache — the
 * exact visit that has to work. So the list is generated from the bundle.
 *
 * Only what the app needs in order to *run* is precached: the document, the
 * script, the stylesheet, the typefaces and the logo. The 512px install icons
 * are deliberately left out — the operating system reads those once when
 * somebody adds the app to their home screen, and 127 KB of artwork nobody
 * looks at again is not worth carrying to a paddock.
 */
function serviceWorker(): Plugin {
  return {
    name: "fieldwork-service-worker",
    apply: "build",
    enforce: "post",
    writeBundle(options, bundle) {
      const outDir = options.dir ?? "dist";

      // Hashed output only. The one .png in here is the logo in the header,
      // which is on every screen; the install icons live in public/ and never
      // reach the bundle, which is what keeps them out of the cache.
      const hashed = Object.keys(bundle)
        .filter((name) => /\.(js|css|woff2|png|svg)$/.test(name) || name === "index.html")
        .sort();

      // Copied verbatim from public/, so they carry no hash and never appear
      // in the bundle. Both are small and both are wanted on first paint.
      const fromPublic = ["favicon.png", "manifest.webmanifest"];

      const precache = [...hashed, ...fromPublic];

      // The cache name changes only when the output does, so a rebuild that
      // produces identical files does not throw away a phone's cache.
      const buildId = createHash("sha256").update(precache.join("\n")).digest("hex").slice(0, 12);

      const source = readFileSync(join(__dirname, "sw", "service-worker.js"), "utf8")
        .replace("__BUILD_ID__", buildId)
        .replace("__PRECACHE__", JSON.stringify(precache, null, 2));

      writeFileSync(join(outDir, "sw.js"), source, "utf8");
    },
  };
}

export default defineConfig({
  // Set VITE_BASE when hosting under a sub-path (e.g. GitHub Pages project site).
  base: process.env.VITE_BASE ?? "/",
  plugins: [react(), tailwindcss(), serviceWorker()],
  server: { port: 5180 },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Tests run with no backend, always.
    //
    // Vitest loads .env through Vite, so a developer with .env.local present
    // had VITE_SUPABASE_URL set during the test run — which made the Supabase
    // client real, and every store function that mirrors a write to the cloud
    // did exactly that. `npm test` wrote fourteen junk form templates into a
    // live project before anybody noticed, and would have kept doing it on
    // every run.
    //
    // Blanking them here means `supabase` is null under test, so the local
    // path is exercised and the cloud path is skipped. That is also the more
    // honest test: these are unit tests of local-first behaviour, and one that
    // depends on a network service is not testing what it claims to.
    env: {
      VITE_SUPABASE_URL: "",
      VITE_SUPABASE_ANON_KEY: "",
    },
  },
});
