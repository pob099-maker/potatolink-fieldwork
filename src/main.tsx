import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { seedIfNeeded } from "./services/seed";
import { startSyncLoop } from "./services/store";
import "./index.css";

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
