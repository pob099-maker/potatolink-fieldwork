/* Fieldwork service worker.
 *
 * The app has always stored its *data* offline — entries go to IndexedDB and
 * sync when there is signal. What it never did was store *itself*. Without
 * this file, a grower who taps the link at the shed, drives out of range and
 * reopens the tab is relying on whatever the browser's HTTP cache happens to
 * be holding, which is not a guarantee and not something to promise anybody
 * standing in a paddock.
 *
 * Two rules shape everything below.
 *
 * 1. Never serve a stale app forever. A cached single-page app that cannot
 *    update itself is worse than no cache: the fix you shipped this morning
 *    never reaches the phone that needs it. Navigations go to the network
 *    first, and a new worker waits rather than activating under a running app.
 * 2. Never touch anything that is not ours. Supabase calls, photo uploads and
 *    every other cross-origin request pass straight through untouched — a sync
 *    request answered from a cache would be a data-loss bug.
 *
 * PRECACHE and BUILD_ID are filled in at build time by the plugin in
 * vite.config.ts, so the list is always the real hashed output.
 */

const BUILD_ID = "__BUILD_ID__";
const PRECACHE = __PRECACHE__;

const CACHE = `fieldwork-${BUILD_ID}`;

/** The one key every navigation is stored under, whatever the URL asked for.
 *
 * The app is a hash router, so every screen is the same document. Keying on
 * the request URL would store a copy per trial, per entry link and per access
 * code — filling the cache with duplicates of one file, and keeping query
 * strings around longer than they need to be. */
const shellUrl = () => new URL("index.html", self.registration.scope).toString();

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // addAll is atomic — one 404 and the whole install fails, which is the
      // behaviour we want. A half-precached shell is the thing that breaks in
      // the field, where nobody can tell you what is missing.
      await cache.addAll(PRECACHE.map((path) => new URL(path, self.registration.scope).toString()));
    })(),
  );
  // Take over as soon as the shell is cached, rather than waiting to be asked.
  //
  // This used to wait. The reasoning was sound — swapping assets under a
  // running app could throw away a half-finished entry form — but it produced
  // a worse failure than the one it prevented. A release that stops the app
  // rendering also stops the only control that can activate its replacement,
  // because the "Reload to update" button lives inside the app. The fix
  // downloads, sits in `waiting`, and stays there forever. It took a
  // SKIP_WAITING sent by hand from a console to recover.
  //
  // Waiting protects against something recoverable; not waiting protects
  // against something that is not. And the risk it was guarding is small here:
  // the app is a single bundle with no code splitting, so a page already
  // running keeps the JavaScript it loaded and fetches nothing more. Nobody's
  // form is lost by this — the page carries on until they choose to reload.
  void self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name.startsWith("fieldwork-") && name !== CACHE).map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

/** The app asks for this when the person has agreed to reload. */
// Kept for a page running an older build that still asks, and harmless now
// that install does it anyway.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") void self.skipWaiting();
});

async function networkFirstShell(request) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(request);
    // Only a real 200 replaces the shell. A captive-portal login page or a
    // proxy error page returns 200 with the wrong body often enough to matter,
    // so check that what came back is actually our document.
    if (fresh.ok && fresh.headers.get("content-type")?.includes("text/html")) {
      await cache.put(shellUrl(), fresh.clone());
    }
    return fresh;
  } catch {
    const cached = await cache.match(shellUrl());
    if (cached) return cached;
    throw new Error("offline and no cached shell");
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh.ok) await cache.put(request, fresh.clone());
  return fresh;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Supabase, storage, everything else.
  if (!url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstShell(request));
    return;
  }

  // Build output carries a content hash in the filename, so a given URL can
  // never mean two different things. Anything else same-origin gets the same
  // treatment on purpose: the only files here are ours.
  event.respondWith(
    cacheFirst(request).catch(async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      throw new Error("offline and not cached");
    }),
  );
});
