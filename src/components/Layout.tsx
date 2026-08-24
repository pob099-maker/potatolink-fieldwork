import type { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
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
 * The AgAims mark: a green field above, the brown bowl of the soil below, and
 * a seedling rising through both.
 *
 * Drawn inline rather than loaded as an image so it stays crisp at any size,
 * needs no network request, and survives both themes. The green is fixed
 * because it is the brand colour; the brown follows currentColor, since a
 * dark background would otherwise swallow it.
 */
/**
 * The AgAims mark: a green field over brown soil, split by a white furrow, with
 * a seedling breaking the line between them. Drawn rather than linked so it
 * survives offline and needs no asset pipeline — the colours are the brand's
 * own, fixed in both themes the way a logo should be.
 */
function AgAimsMark() {
  return (
    <svg viewBox="0 0 48 48" role="img" aria-label="AgAims" className="h-9 w-9 shrink-0">
      <rect width="48" height="48" fill="#ffffff" />
      {/* The field */}
      <rect width="48" height="19" fill="#5f9c0a" />
      {/* The soil, with a furrow cut out of it: widest under the field and
          closing to a point before the bottom edge, so the soil stays whole */}
      <rect y="19" width="48" height="29" fill="#6b3f12" />
      <path d="M17 19c0 10 3 17 7 22 4-5 7-12 7-22Z" fill="#ffffff" />
      {/* The seedling, breaking the line between field and soil */}
      <g fill="#ffffff">
        <path d="M22.4 11h3.2v30h-3.2Z" />
        <path d="M24 20c0-6.6 4.2-11.5 10-12.1C34 14.5 29.8 19.4 24 20Z" />
        <path d="M24 23c0-5.5-3.4-9.6-8.2-10.1C15.8 18.4 19.2 22.5 24 23Z" />
      </g>
    </svg>
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
