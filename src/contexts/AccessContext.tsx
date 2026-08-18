import { createContext, useContext, useState, type ReactNode } from "react";

// MVP access gate: a shared code instead of real auth (per the brief, user
// authentication is explicitly out of scope for this stage). Held in memory
// only — localStorage is banned in this project.

interface AccessContextValue {
  unlocked: boolean;
  tryUnlock: (code: string) => boolean;
}

const ACCESS_CODE = (import.meta.env.VITE_ACCESS_CODE as string | undefined) ?? "spud26";

const AccessContext = createContext<AccessContextValue | null>(null);

export function AccessProvider({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);

  function tryUnlock(code: string): boolean {
    const ok = code.trim() === ACCESS_CODE;
    if (ok) setUnlocked(true);
    return ok;
  }

  return (
    <AccessContext.Provider value={{ unlocked, tryUnlock }}>{children}</AccessContext.Provider>
  );
}

export function useAccess(): AccessContextValue {
  const context = useContext(AccessContext);
  if (!context) throw new Error("useAccess must be used inside AccessProvider");
  return context;
}
