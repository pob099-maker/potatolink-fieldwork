import { HashRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Layout } from "./components/Layout";
import { AccessProvider } from "./contexts/AccessContext";
import { AuthProvider } from "./contexts/AuthContext";
import { RequireStaff } from "./components/RequireStaff";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useStoreInvalidation } from "./hooks/useCollections";
import { DashboardPage } from "./pages/DashboardPage";
import { EntryPage } from "./pages/EntryPage";
import { ImportTrialPage } from "./pages/ImportTrialPage";
import { NewTrialPage } from "./pages/NewTrialPage";
import { TemplateEditorPage } from "./pages/TemplateEditorPage";
import { EconomicsPage } from "./pages/EconomicsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TrialDetailPage } from "./pages/TrialDetailPage";
import { TrialsPage } from "./pages/TrialsPage";

const queryClient = new QueryClient();

/**
 * The economics page used to be called "results". These routes are flat rather
 * than nested, so a relative redirect pops the whole path and loses the trial
 * — the id has to be carried across explicitly.
 */
function LegacyResultsRedirect() {
  const { trialId } = useParams<{ trialId: string }>();
  return <Navigate to={`/trials/${trialId}/economics`} replace />;
}

function AppRoutes() {
  useStoreInvalidation();
  return (
    <Layout>
      <Routes>
        {/*
          Recording data is the one thing that must never need an account: a
          grower opens their link and fills the form. Everything that changes
          what a trial *is* — its sites, practices, forms and economics — sits
          behind staff sign-in.
        */}
        <Route path="/trials/:trialId/entry" element={<EntryPage />} />
        <Route
          path="*"
          element={
            <RequireStaff>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/trials" element={<TrialsPage />} />
                <Route path="/trials/new" element={<NewTrialPage />} />
                <Route path="/trials/import" element={<ImportTrialPage />} />
                <Route path="/trials/:trialId" element={<TrialDetailPage />} />
                <Route path="/trials/:trialId/template" element={<TemplateEditorPage />} />
                <Route path="/trials/:trialId/economics" element={<EconomicsPage />} />
                {/* The page was called "results" while it only ever held the
                    economics. Old links keep working. */}
                <Route path="/trials/:trialId/results" element={<LegacyResultsRedirect />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Routes>
            </RequireStaff>
          }
        />
      </Routes>
    </Layout>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
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
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
