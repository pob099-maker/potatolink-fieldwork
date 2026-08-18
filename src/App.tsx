import { HashRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Layout } from "./components/Layout";
import { AccessProvider } from "./contexts/AccessContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useStoreInvalidation } from "./hooks/useCollections";
import { DashboardPage } from "./pages/DashboardPage";
import { EntryPage } from "./pages/EntryPage";
import { TemplateEditorPage } from "./pages/TemplateEditorPage";
import { ResultsPage } from "./pages/ResultsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TrialDetailPage } from "./pages/TrialDetailPage";
import { TrialsPage } from "./pages/TrialsPage";

const queryClient = new QueryClient();

function AppRoutes() {
  useStoreInvalidation();
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/trials" element={<TrialsPage />} />
        <Route path="/trials/:trialId" element={<TrialDetailPage />} />
        <Route path="/trials/:trialId/entry" element={<EntryPage />} />
        <Route path="/trials/:trialId/template" element={<TemplateEditorPage />} />
        <Route path="/trials/:trialId/results" element={<ResultsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </Layout>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AccessProvider>
          {/*
            Hash routing: static hosts (GitHub Pages included) answer an
            unknown deep path with a 404 before any fallback runs, which makes
            an emailed entry link look broken to mail scanners and previews.
            Everything after the # is never sent to the server, so a deep link
            always resolves. Legacy path links are redirected by 404.html.
          */}
          <HashRouter
            future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          >
            <AppRoutes />
          </HashRouter>
        </AccessProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
