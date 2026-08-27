import { useEffect, useState } from "react";
import { useTheme } from "../contexts/ThemeContext";
import { useAuth } from "../contexts/AuthContext";
import { isBackendConfigured } from "../lib/supabase";
import { pullFromCloud, pushBaseData, setDeviceRole, syncPending } from "../services/store";
import { useDeviceRole } from "../hooks/useCollections";
import { Card, PageTitle, Skeleton } from "../components/ui";
import {
  describePersistence,
  formatBytes,
  storageReport,
  type StorageReport,
} from "../services/storagePersistence";

export function SettingsPage() {
  const { theme, toggleTheme } = useTheme();
  const { email, required: staffRequired, signOut } = useAuth();
  const [pushResult, setPushResult] = useState<string | null>(null);
  const deviceRole = useDeviceRole();

  return (
    <div className="space-y-4">
      <PageTitle>Settings</PageTitle>

      <Card>
        <h2 className="font-semibold">Signed in</h2>
        {email ? (
          <>
            <p className="mt-1 text-sm text-ink-soft">
              You are signed in as <span className="font-medium">{email}</span>.
            </p>
            <p className="mt-1 text-sm text-ink-soft">
              Sign out if someone else needs to use this device. Data already saved here
              stays put — signing out does not remove anything.
            </p>
            <button
              type="button"
              onClick={() => void signOut()}
              className="mt-3 min-h-11 rounded-lg border border-line-strong px-4 py-2.5 font-medium"
            >
              Sign out
            </button>
          </>
        ) : (
          <p className="mt-1 text-sm text-ink-soft">
            {staffRequired
              ? "Not signed in."
              : "Sign-in is switched off for this deployment, so staff pages are open to anyone with the address."}
          </p>
        )}
      </Card>

      <Card>
        <h2 className="font-semibold">Appearance</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Currently using {theme} mode. The choice follows your device preference on each
          visit.
        </p>
        <button
          type="button"
          onClick={toggleTheme}
          className="mt-3 min-h-11 rounded-lg border border-line-strong px-4 py-2.5 font-medium"
        >
          Switch to {theme === "dark" ? "light" : "dark"} mode
        </button>
      </Card>

      <Card>
        <h2 className="font-semibold">What this device opens on</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Stated rather than left as magic: a device that records observations opens
          straight on recording, and one that sets trials up opens on the dashboard. It
          follows whatever was last done here, and can be set either way.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(["recording", "setup"] as const).map((role) => (
            <button
              key={role}
              type="button"
              aria-pressed={deviceRole.data === role}
              onClick={() => void setDeviceRole(role)}
              className={`min-h-11 rounded-lg border px-4 py-2.5 font-medium ${
                deviceRole.data === role
                  ? "border-primary bg-primary text-white"
                  : "border-line-strong"
              }`}
            >
              {role === "recording" ? "Recording observations" : "Setting up trials"}
            </button>
          ))}
        </div>
      </Card>

      <StorageCard />

      <Card>
        <h2 className="font-semibold">Who can get in</h2>
        {/* Stated in the app rather than only in a doc, because "we'll lock it
            down before go-live" is the kind of intention that survives right
            up until nobody can remember what it covered. Reads its own
            configuration, so it stops warning once the app is actually
            locked down instead of needing to be edited. */}
        {staffRequired ? (
          <>
            <p className="mt-1 text-sm text-success">
              Staff sign-in is required to change a trial.
            </p>
            <p className="mt-2 text-sm text-ink-soft">
              Check the database rules are in place too — the sign-in screen guards the
              pages, not the data. Step 4 of the go-live checklist in{" "}
              <code>docs/GO-LIVE.md</code>.
            </p>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-warning">
              Open for testing — anyone with the link can change a trial.
            </p>
            <p className="mt-2 text-sm text-ink-soft">
              Deliberate while the app is being tried out, so nothing blocks exploring it.
              Before real growers or real contact details go in, work through{" "}
              <code>docs/GO-LIVE.md</code> — six steps, and the order matters: closing
              sign-ups comes before requiring them, or anyone can sign themselves up and
              the login screen only looks like protection.
            </p>
          </>
        )}
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
              <p role="status" className="mt-2 text-sm text-ink-soft">
                {pushResult}
              </p>
            ) : null}
          </>
        ) : (
          <p className="mt-1 text-sm text-ink-soft">
            No Supabase project configured. Copy <code>.env.example</code> to{" "}
            <code>.env.local</code>, add your project URL and anon key, and restart the
            app. Until then, everything runs offline on this device.
          </p>
        )}
      </Card>
    </div>
  );
}

/**
 * Whether the browser has promised to keep what is stored here.
 *
 * Worth a card rather than a line, because it is the one thing that decides
 * whether "saved on this device" means anything. Storage is best-effort by
 * default and can be evicted when a phone runs low on space — which is the
 * failure this app is least able to survive and least able to report, since a
 * record that has been thrown away leaves nothing behind to say so.
 *
 * Only reads. The request is made once at startup; looking at a settings page
 * must not trigger a permission decision.
 */
function StorageCard() {
  const [report, setReport] = useState<StorageReport | null>(null);

  useEffect(() => {
    let live = true;
    void storageReport(navigator.storage).then((result) => {
      if (live) setReport(result);
    });
    return () => {
      live = false;
    };
  }, []);

  if (!report) {
    return (
      <Card>
        <h2 className="font-semibold">Storage on this device</h2>
        <Skeleton lines={2} />
      </Card>
    );
  }

  const described = describePersistence(report.state);

  return (
    <Card>
      <h2 className="font-semibold">Storage on this device</h2>
      <p
        className={`mt-1 text-sm ${described.reassuring ? "text-success" : "text-warning"}`}
      >
        {described.reassuring ? "●" : "◌"} {described.heading}
      </p>
      <p className="mt-1 text-sm text-ink-soft">{described.detail}</p>
      {report.usage !== null ? (
        <p className="mt-2 text-sm text-ink-faint">
          Using {formatBytes(report.usage)}
          {report.quota !== null ? ` of about ${formatBytes(report.quota)} available` : ""}.
        </p>
      ) : null}
    </Card>
  );
}
