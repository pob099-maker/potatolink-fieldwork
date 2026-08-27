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

      {/* Says where you land and offers the one change — the same shape as the
          theme card above, which had it right.

          It used to offer two filled buttons for a binary, which reads as two
          things to do when one of them is already true, above a paragraph that
          explained the mechanism ("stated rather than left as magic") before
          you could act on it. That sentence was a note to whoever wrote the
          code and had no business being on screen. The role follows what was
          last done here, so this is an override for the rare wrong guess, not
          a decision to put in front of somebody. */}
      <Card>
        <h2 className="font-semibold">Where this device opens</h2>
        {deviceRole.isPending ? (
          <Skeleton lines={2} />
        ) : (
          <>
            <p className="mt-1 text-sm text-ink-soft">
              {deviceRole.data === "recording"
                ? "Straight on recording an observation. It follows what this device is used for, so a phone that records ends up here on its own."
                : "On the dashboard. It follows what this device is used for, so a computer that sets trials up ends up here on its own."}
            </p>
            <button
              type="button"
              onClick={() =>
                void setDeviceRole(deviceRole.data === "recording" ? "setup" : "recording")
              }
              className="mt-3 min-h-11 rounded-lg border border-line-strong px-4 py-2.5 font-medium"
            >
              {deviceRole.data === "recording"
                ? "Open on the dashboard instead"
                : "Open straight on recording instead"}
            </button>
          </>
        )}
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
