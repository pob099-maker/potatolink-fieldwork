// Registering the service worker, and getting out of its way when it updates.
//
// The service worker is what makes the app itself survive a paddock with no
// signal — see sw/service-worker.js. This is the half that lives in the page:
// it registers the worker, and it handles the one genuinely awkward moment in
// the lifecycle, which is a new version arriving while somebody is using the
// old one.
//
// A new worker now activates as soon as it has cached the shell, and the page
// is told rather than asked. The page itself keeps running the code it already
// loaded — a single bundle, nothing further fetched — so nobody loses a
// half-finished entry form; the new version takes effect when they reload.
//
// It used to wait to be asked. That protected an unsaved form and created a
// worse problem: the control that activates the replacement lives inside the
// app, so a release that stopped the app rendering could never be superseded.
// The fix would download, sit in `waiting`, and stay there. Recovering meant
// sending SKIP_WAITING by hand from a console, which is not a thing to ask of
// somebody in a paddock.

/** How the page hears that a newer version is installed and waiting. */
type UpdateListener = () => void;

let waitingWorker: ServiceWorker | null = null;
let listener: UpdateListener | null = null;

/** Called when a new version finishes installing behind the current one. */
export function onUpdateReady(callback: UpdateListener): void {
  listener = callback;
  if (waitingWorker) callback();
}

function announce(worker: ServiceWorker): void {
  waitingWorker = worker;
  listener?.();
}

/**
 * Reload into the version that is already active.
 *
 * Still driven by controllerchange when there is a worker to wait on, because
 * skipWaiting is asynchronous and reloading too early can land back on the old
 * one and look like the update did nothing.
 */
export function applyUpdate(): void {
  if (!waitingWorker) {
    window.location.reload();
    return;
  }
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // Chrome can fire this more than once; reloading twice is a visible flash.
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
  waitingWorker.postMessage("SKIP_WAITING");
}

/**
 * Register the worker, unless we are in dev.
 *
 * Dev is excluded on purpose: Vite serves modules that a cache-first worker
 * would happily freeze, and the resulting "why is my edit not showing"
 * is a worse bug than the one this fixes.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    const base = import.meta.env.BASE_URL;
    void navigator.serviceWorker
      .register(`${base}sw.js`, { scope: base })
      .then((registration) => {
        // Already waiting when the page opened — a previous visit installed it.
        if (registration.waiting && navigator.serviceWorker.controller) {
          announce(registration.waiting);
        }

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            // A controller means this is a replacement rather than the very
            // first install. Announcing a first install would be asking
            // somebody to reload into the page they are already looking at.
            //
            // "installed" rather than "activated": the worker skips waiting
            // now, so by the time anybody reads the banner it has usually
            // taken over already. The banner reports that, it does not cause
            // it — which is why its wording says the app has updated rather
            // than asking permission to update it.
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              announce(installing);
            }
          });
        });
      })
      .catch(() => {
        // A failed registration costs the offline shell, not the app. Entries
        // still save to IndexedDB and still sync, so there is nothing worth
        // interrupting anybody about.
      });
  });
}
