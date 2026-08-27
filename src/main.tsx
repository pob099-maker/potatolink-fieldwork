import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { seedIfNeeded } from "./services/seed";
import { startSyncLoop } from "./services/store";
import { registerServiceWorker } from "./services/appUpdate";
import { LocalDatabaseError, openDb } from "./lib/localdb";
import "./index.css";

// Before the seed, and outside the promise: caching the app shell is what lets
// somebody open Fieldwork in a paddock with no signal at all, and it should not
// wait on IndexedDB to finish or be skipped if seeding fails.
registerServiceWorker();

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing #root element");
}

function mount(): void {
  createRoot(rootElement as HTMLElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

/**
 * The local database could not be opened, so there is nothing to render into.
 *
 * Plain DOM rather than React, because this is the case where the app's own
 * startup did not complete — reaching for the framework to report that the
 * framework never started is how a blank page stays blank.
 *
 * It says what to do. The usual cause is another tab holding the database open
 * at an older version, and the remedy is closing it, which nobody guesses from
 * a spinner.
 */
function reportUnavailable(message: string): void {
  const root = rootElement as HTMLElement;
  root.innerHTML = "";

  const wrap = document.createElement("main");
  wrap.style.cssText =
    "max-width:34rem;margin:0 auto;padding:3rem 1.5rem;font-family:system-ui,sans-serif;line-height:1.6";

  const heading = document.createElement("h1");
  heading.textContent = "Fieldwork could not start";
  heading.style.cssText = "font-size:1.5rem;margin:0 0 0.75rem";

  const detail = document.createElement("p");
  detail.textContent = message;
  detail.style.cssText = "margin:0 0 1.25rem";

  const reassure = document.createElement("p");
  reassure.textContent =
    "Nothing has been lost. Entries already saved on this device are still there and will sync once the app opens.";
  reassure.style.cssText = "margin:0 0 1.25rem;color:#555";

  const retry = document.createElement("button");
  retry.textContent = "Try again";
  retry.style.cssText =
    "min-height:2.75rem;padding:0 1.25rem;border-radius:0.5rem;border:0;background:#6e4320;color:#fff;font:inherit;font-weight:600;cursor:pointer";
  retry.addEventListener("click", () => window.location.reload());

  const keepTrying = document.createElement("p");
  keepTrying.textContent = "Still trying — this usually clears by itself.";
  keepTrying.style.cssText = "margin:1.25rem 0 0;color:#555;font-size:0.9rem";

  wrap.append(heading, detail, reassure, retry, keepTrying);
  root.append(wrap);

  // Keep trying on its own rather than waiting to be asked.
  //
  // The blocking connection is usually another copy of the app that is about
  // to be suspended or evicted — on a phone, quite possibly one the person
  // cannot even see, because the app may be installed *and* open in a browser
  // tab. Telling somebody standing in a paddock to go and close tabs is asking
  // them to debug; reloading every few seconds gets there without them.
  window.setInterval(() => {
    void openDb()
      .then(() => window.location.reload())
      .catch(() => {
        // Still blocked. The next tick will try again.
      });
  }, 4000);
}

// Seeding is a convenience — it puts demonstration trials on a new device. The
// app is worth rendering whether or not it worked, so a failure here degrades
// the first run rather than replacing the whole app with nothing.
//
// This used to be `seedIfNeeded().then(render)` with no catch, so anything that
// stopped the seed resolving left a blank page and no explanation. An
// IndexedDB upgrade waiting on another tab does exactly that, and waits
// forever.
void seedIfNeeded()
  .catch((error: unknown) => {
    if (error instanceof LocalDatabaseError) throw error;
    console.warn("Could not seed the demonstration data:", error);
  })
  .then(() => {
    startSyncLoop();
    mount();
  })
  .catch((error: unknown) => {
    reportUnavailable(
      error instanceof LocalDatabaseError
        ? error.message
        : "Something went wrong starting the app. Reloading usually fixes it.",
    );
  });
