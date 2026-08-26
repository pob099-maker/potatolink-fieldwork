import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { seedIfNeeded } from "./services/seed";
import { startSyncLoop } from "./services/store";
import { registerServiceWorker } from "./services/appUpdate";
import "./index.css";

// Before the seed, and outside the promise: caching the app shell is what lets
// somebody open Fieldwork in a paddock with no signal at all, and it should not
// wait on IndexedDB to finish or be skipped if seeding fails.
registerServiceWorker();

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing #root element");
}

void seedIfNeeded().then(() => {
  startSyncLoop();
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
