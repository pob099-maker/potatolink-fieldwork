import { useState } from "react";
import { useTheme } from "../contexts/ThemeContext";
import { useAuth } from "../contexts/AuthContext";
import { isBackendConfigured } from "../lib/supabase";
import { pullFromCloud, pushBaseData, syncPending } from "../services/store";
import { Card, PageTitle } from "../components/ui";

export function SettingsPage() {
  const { theme, toggleTheme } = useTheme();
  const { email, required, signOut } = useAuth();
  const [pushResult, setPushResult] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <PageTitle>Settings</PageTitle>

      <Card>
        <h2 className="font-semibold">Signed in</h2>
        {email ? (
          <>
            <p className="mt-1 text-sm text-ink/70 dark:text-ink-dark/70">
              You are signed in as <span className="font-medium">{email}</span>.
            </p>
            <p className="mt-1 text-sm text-ink/60 dark:text-ink-dark/60">
              Sign out if someone else needs to use this device. Data already saved here
              stays put — signing out does not remove anything.
            </p>
            <button
              type="button"
              onClick={() => void signOut()}
              className="mt-3 min-h-11 rounded-lg border border-ink/20 px-4 py-2.5 font-medium dark:border-ink-dark/20"
            >
              Sign out
            </button>
          </>
        ) : (
          <p className="mt-1 text-sm text-ink/60 dark:text-ink-dark/60">
            {required
              ? "Not signed in."
              : "Sign-in is switched off for this deployment, so staff pages are open to anyone with the address."}
          </p>
        )}
      </Card>

      <Card>
        <h2 className="font-semibold">Appearance</h2>
        <p className="mt-1 text-sm text-ink/60 dark:text-ink-dark/60">
          Currently using {theme} mode. The choice follows your device preference on each
          visit.
        </p>
        <button
          type="button"
          onClick={toggleTheme}
          className="mt-3 min-h-11 rounded-lg border border-ink/20 px-4 py-2.5 font-medium dark:border-ink-dark/20"
        >
          Switch to {theme === "dark" ? "light" : "dark"} mode
        </button>
      </Card>

      <Card>
        <h2 className="font-semibold">Backend</h2>
        {isBackendConfigured() ? (
          <>
            <p className="mt-1 text-sm text-success">Supabase connected.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  void syncPending().then(() =>
                    pullFromCloud().then((result) =>
                      setPushResult(result.success ? result.data : result.error),
                    ),
                  )
                }
                className="min-h-11 rounded-lg bg-primary px-4 py-2.5 font-medium text-white"
              >
                Sync now (push &amp; refresh)
              </button>
              <button
                type="button"
                onClick={() =>
                  void pushBaseData().then((result) => {
                    setPushResult(result.success ? result.data : result.error);
                    void syncPending();
                  })
                }
                className="min-h-11 rounded-lg border border-primary px-4 py-2.5 font-medium text-primary dark:text-primary-soft"
              >
                Push trial setup to Supabase
              </button>
            </div>
            {pushResult ? (
              <p role="status" className="mt-2 text-sm text-ink/70 dark:text-ink-dark/70">
                {pushResult}
              </p>
            ) : null}
          </>
        ) : (
          <p className="mt-1 text-sm text-ink/60 dark:text-ink-dark/60">
            No Supabase project configured. Copy <code>.env.example</code> to{" "}
            <code>.env.local</code>, add your project URL and anon key, and restart the
            app. Until then, everything runs offline on this device.
          </p>
        )}
      </Card>
    </div>
  );
}
