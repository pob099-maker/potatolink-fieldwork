import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { dbGet, dbPut } from "../lib/localdb";

// MVP access gate: a shared code instead of real auth (per the brief, user
// authentication is explicitly out of scope for this stage).
//
// The unlock is remembered on the device. localStorage is banned in this
// project, so it lives in IndexedDB alongside everything else — a grower in a
// shed should not retype the code every time the phone locks the tab. The
// stored value records which code was accepted, so changing VITE_ACCESS_CODE
// re-locks every device rather than leaving old ones open.

interface AccessContextValue {
  unlocked: boolean;
  tryUnlock: (code: string) => boolean;
  lock: () => void;
}

const ACCESS_CODE = (import.meta.env.VITE_ACCESS_CODE as string | undefined) ?? "spud26";
const ACCESS_KEY = "access";

const AccessContext = createContext<AccessContextValue | null>(null);

export function AccessProvider({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    let active = true;
    void dbGet<{ key: string; code: string }>("meta", ACCESS_KEY).then((stored) => {
      if (active && stored?.code === ACCESS_CODE) setUnlocked(true);
    });
    return () => {
      active = false;
    };
  }, []);

  function tryUnlock(code: string): boolean {
    const ok = code.trim() === ACCESS_CODE;
    if (ok) {
      setUnlocked(true);
      void dbPut("meta", { key: ACCESS_KEY, code: ACCESS_CODE });
    }
    return ok;
  }

  function lock(): void {
    setUnlocked(false);
    void dbPut("meta", { key: ACCESS_KEY, code: "" });
  }

  return (
    <AccessContext.Provider value={{ unlocked, tryUnlock, lock }}>
      {children}
    </AccessContext.Provider>
  );
}

export function useAccess(): AccessContextValue {
  const context = useContext(AccessContext);
  if (!context) throw new Error("useAccess must be used inside AccessProvider");
  return context;
}
