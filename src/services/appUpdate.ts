// Registering the service worker, and getting out of its way when it updates.
//
// The service worker is what makes the app itself survive a paddock with no
// signal — see sw/service-worker.js. This is the half that lives in the page:
// it registers the worker, and it handles the one genuinely awkward moment in
// the lifecycle, which is a new version arriving while somebody is using the
// old one.
//
// Swapping the code under a running app is not an option here. Somebody may be
// halfway through an entry form with unsaved answers on screen, possibly
// standing in a plot they walked to. So a new worker installs, then waits, and
// the person is asked. Nothing reloads until they say so.

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
 * Hand over to the waiting version and reload.
 *
 * The reload is driven by controllerchange rather than called straight after
 * the message, because skipWaiting is asynchronous — reloading immediately can
 * land back on the old worker and look like the update did nothing.
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
            // first install. Prompting on a first install would be asking
            // somebody to reload into the page they are already looking at.
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
