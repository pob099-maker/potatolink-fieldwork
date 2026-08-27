// Who is running the trial, as opposed to who is filling in a form.
//
// Two different questions need two different answers. A grower in a paddock
// gets a shared code (see AccessContext) because handing out accounts to
// growers is a barrier that stops data being collected at all. Staff — the
// people who create trials, edit the forms and read the results — sign in
// properly, because those pages change what everybody else sees.
//
// Sign-in is by emailed link: no password to set, forget, or type on a phone
// in a shed, and nothing for this app to store.

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
  sendLink: (email: string) => Promise<Result<string>>;
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
    async function sendLink(email: string): Promise<Result<string>> {
      if (!supabase) {
        return { success: false, error: "No Supabase project is configured." };
      }
      const address = email.trim();
      if (!address) return { success: false, error: "Enter your email address." };

      const { error } = await supabase.auth.signInWithOtp({
        email: address,
        // Back to this app, whatever host it is served from, keeping the
        // hash route so a deployment under a sub-path still lands correctly.
        options: { emailRedirectTo: window.location.origin + window.location.pathname },
      });
      if (error) return { success: false, error: error.message };
      return { success: true, data: `Check ${address} for a sign-in link.` };
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
      sendLink,
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
