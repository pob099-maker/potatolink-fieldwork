// Who is running the trial, as opposed to who is filling in a form.
//
// Two different questions need two different answers. A grower in a paddock
// gets a shared code (see AccessContext) because handing out accounts to
// growers is a barrier that stops data being collected at all. Staff — the
// people who create trials, edit the forms and read the results — sign in
// properly, because those pages change what everybody else sees.
//
// Sign-in is by email and password.
//
// It was an emailed link, on the reasoning that there is no password to set,
// forget, or type on a phone in a shed. That reasoning was about growers — and
// growers never sign in. They use a link and a code and always will.
//
// Staff sign in at a desk, on their own laptop, with a password manager. For
// them the emailed link bought nothing and cost a great deal: an SMTP provider
// with an app password or a verified domain, a redirect URL allow-list, a
// two-emails-an-hour cap on the default sender, and a PKCE exchange that fails
// silently if the link is opened on a different device from the one that asked
// — which is exactly what happens when the request comes from a laptop and the
// inbox is on a phone.
//
// Five failure modes, all downstream of one choice, none of them visible to
// the person who just wanted to look at a trial. A password has one.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { isBackendConfigured, supabase } from "../lib/supabase";
import type { Result } from "../types";

interface AuthContextValue {
  /** null when signed out, or when no backend is configured at all. */
  session: Session | null;
  email: string | null;
  /** False until the stored session has been read, so nothing flashes. */
  ready: boolean;
  /** Whether staff pages are gated at all in this deployment. */
  required: boolean;
  signIn: (email: string, password: string) => Promise<Result<string>>;
  signOut: () => Promise<void>;
}

/**
 * Set VITE_REQUIRE_STAFF_SIGNIN=false to run without the gate — useful for a
 * local build, and the way back in if sign-in ever fails in the field.
 */
const REQUIRED =
  (import.meta.env.VITE_REQUIRE_STAFF_SIGNIN as string | undefined) !== "false";

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!isBackendConfigured());

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    // Covers the return trip from the emailed link, and expiry.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    async function signIn(email: string, password: string): Promise<Result<string>> {
      if (!supabase) {
        return { success: false, error: "No Supabase project is configured." };
      }
      const address = email.trim();
      if (!address) return { success: false, error: "Enter your email address." };
      if (!password) return { success: false, error: "Enter your password." };

      const { error } = await supabase.auth.signInWithPassword({
        email: address,
        password,
      });

      if (error) {
        // Deliberately the same message whether the address is unknown or the
        // password is wrong. Saying which would tell somebody probing the app
        // whose email addresses have accounts, and this is a public URL.
        if (/invalid login credentials/i.test(error.message)) {
          return {
            success: false,
            error: "That email and password did not match. Check both, or ask for access below.",
          };
        }
        return { success: false, error: error.message };
      }
      return { success: true, data: "Signed in." };
    }

    async function signOut(): Promise<void> {
      await supabase?.auth.signOut();
      setSession(null);
    }

    return {
      session,
      email: session?.user.email ?? null,
      ready,
      // Nothing to sign in to without a backend, so the gate stays open.
      required: REQUIRED && isBackendConfigured(),
      signIn,
      signOut,
    };
  }, [session, ready]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
