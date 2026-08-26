import type { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import agAimsMark from "../assets/agaims-mark.png";
import { useTheme } from "../contexts/ThemeContext";
import { useAuth } from "../contexts/AuthContext";
import { isBackendConfigured } from "../lib/supabase";
import { UpdateBanner } from "./ui";

/* Where you are, not what you can do.
 *
 * "New trial" used to sit here as a fourth tab, the only verb among three
 * nouns — so the one destructive-ish action in the app looked exactly like the
 * places you go to look at things. It is a button now, to the right, where an
 * action belongs. */
const NAV_ITEMS = [
  { to: "/", label: "Dashboard" },
  { to: "/trials", label: "Trials" },
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

/* Drawn rather than typed.
 *
 * This control used to be an emoji. Emoji render from the operating system's
 * own colour font, so they ignore the palette entirely, sit at a size the type
 * scale does not control, and look like four different buttons across a phone,
 * a Mac and a Windows laptop. A path that inherits currentColor does not. */
function ThemeIcon({ dark }: { dark: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      {dark ? (
        <>
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
        </>
      ) : (
        <path d="M20 14.5A8.2 8.2 0 0 1 9.5 4 8.3 8.3 0 1 0 20 14.5Z" strokeLinejoin="round" />
      )}
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
    <div className="min-h-screen bg-paper text-ink">
      {/* Nine nav stops before the content is a long way to tab on a keyboard,
          and longer on a screen reader. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2.5 focus:font-medium focus:text-white"
      >
        Skip to content
      </a>
      <UpdateBanner />
      <header className="border-b-2 border-accent/60 bg-surface dark:border-accent/40">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-2 px-4 py-3">
          <NavLink to="/" className="flex items-center gap-2.5 text-primary dark:text-primary-soft">
            <AgAimsMark />
            <span className="leading-tight">
              <span className="block font-display text-title font-extrabold">Fieldwork</span>
              <span className="hidden font-display text-eyebrow uppercase text-ink-faint sm:block">
                Trial data collection
              </span>
            </span>
          </NavLink>
          <div className="flex items-center gap-2">
            {focused ? null : (
              <NavLink
                to="/trials/new"
                className="hidden min-h-11 items-center rounded-lg bg-primary px-4 font-medium text-white sm:inline-flex"
              >
                New trial
              </NavLink>
            )}
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-line text-ink-soft"
            >
              <ThemeIcon dark={theme === "dark"} />
            </button>
          </div>
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
                    isActive ? "bg-primary text-white" : "text-ink-soft hover:bg-ink/8"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
            {/* The action needs to be reachable on a phone too, where it is
                hidden from the header for want of room. */}
            <NavLink
              to="/trials/new"
              className="min-h-11 rounded-lg px-3 py-2 font-medium text-primary dark:text-primary-soft sm:hidden"
            >
              New trial
            </NavLink>
            {/* Who the app thinks you are, which matters when several people
                share a laptop at a field day. */}
            {email ? (
              <NavLink
                to="/settings"
                className="ml-auto max-w-[40%] truncate text-sm text-ink-faint hover:underline"
                title={email}
              >
                {email}
              </NavLink>
            ) : null}
          </nav>
        )}
      </header>
      {!isBackendConfigured() ? (
        <p className="mx-auto max-w-4xl px-4 pt-3 text-sm text-ink-faint">
          Offline mode — entries stay on this device until Supabase is configured.
        </p>
      ) : null}
      <main id="main" className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-5">
        {children}
      </main>
    </div>
  );
}
