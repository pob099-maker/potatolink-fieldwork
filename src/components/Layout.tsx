import type { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import agAimsMark from "../assets/agaims-mark.png";
import { useTheme } from "../contexts/ThemeContext";
import { useAuth } from "../contexts/AuthContext";
import { isBackendConfigured } from "../lib/supabase";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard" },
  { to: "/trials", label: "Trials" },
  { to: "/trials/new", label: "New trial" },
  { to: "/settings", label: "Settings" },
];

/**
 * The AgAims mark, cropped from the supplied logo. The white is part of the
 * artwork — the furrow between the mounds and the outline around the leaves —
 * so it sits on its own light chip rather than on the header, which would eat
 * it in dark mode.
 */
function AgAimsMark() {
  return (
    <img
      src={agAimsMark}
      alt="AgAims"
      width={36}
      height={36}
      className="size-9 shrink-0 rounded-md bg-white"
    />
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { theme, toggleTheme } = useTheme();
  const { email } = useAuth();
  // A grower opens a link straight to a form. Showing them the staff
  // navigation invites taps into trial setup and makes a one-job screen look
  // like an admin console, so the entry route runs without it.
  const focused = /\/trials\/[^/]+\/entry/.test(useLocation().pathname);

  return (
    <div className="min-h-screen bg-paper text-ink dark:bg-paper-dark dark:text-ink-dark">
      <header className="border-b-2 border-accent/60 bg-surface dark:border-accent/40 dark:bg-surface-dark">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-2 px-4 py-3">
          <NavLink to="/" className="flex items-center gap-2.5 text-primary dark:text-primary-soft">
            <AgAimsMark />
            <span className="leading-tight">
              <span className="block font-display text-lg font-extrabold">
                Fieldwork
              </span>
              <span className="hidden text-[0.6rem] font-medium uppercase tracking-[0.18em] text-ink/50 dark:text-ink-dark/50 sm:block">
                Trial data collection
              </span>
            </span>
          </NavLink>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            className="min-h-11 min-w-11 rounded-lg border border-ink/15 px-3 dark:border-ink-dark/15"
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </div>
        {focused ? null : (
        <nav className="mx-auto flex max-w-4xl flex-wrap items-center gap-1 px-4 pb-2">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `min-h-11 rounded-lg px-3 py-2 font-medium ${
                  isActive
                    ? "bg-primary text-white"
                    : "text-ink/70 hover:bg-ink/5 dark:text-ink-dark/70 dark:hover:bg-ink-dark/10"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
          {/* Who the app thinks you are, which matters when several people
              share a laptop at a field day. */}
          {email ? (
            <NavLink
              to="/settings"
              className="ml-auto max-w-[40%] truncate text-sm text-ink/50 hover:underline dark:text-ink-dark/50"
              title={email}
            >
              {email}
            </NavLink>
          ) : null}
        </nav>
        )}
      </header>
      {!isBackendConfigured() ? (
        <p className="mx-auto max-w-4xl px-4 pt-3 text-sm text-ink/50 dark:text-ink-dark/50">
          Offline mode — entries stay on this device until Supabase is configured.
        </p>
      ) : null}
      <main className="mx-auto max-w-4xl px-4 py-4">{children}</main>
    </div>
  );
}
