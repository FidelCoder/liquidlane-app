import { useMemo, useSyncExternalStore } from "react";
import type { Pairing } from "./types";
import type { WorkspaceRole } from "./navigation";

const event = "liquidlane-pairing-changed";
const key = (account: string, role?: WorkspaceRole) => `liquidlane:pairing:${account}${role ? `:${role}` : ""}`;
function subscribe(listener: () => void) {
  window.addEventListener(event, listener);
  window.addEventListener("storage", listener);
  return () => { window.removeEventListener(event, listener); window.removeEventListener("storage", listener); };
}
export function usePairing(account: string, role: WorkspaceRole) {
  const value = useSyncExternalStore(subscribe, () => sessionStorage.getItem(key(account, role)) ?? sessionStorage.getItem(key(account)), () => null);
  const pairing = useMemo(() => {
    try {
      const parsed = value ? JSON.parse(value) as Pairing : null;
      return parsed?.account === account && parsed.role === role && parsed.pairing_id ? parsed : null;
    } catch { return null; }
  }, [value, account, role]);
  function setPairing(pairing: Pairing | null) {
    try { if (JSON.parse(sessionStorage.getItem(key(account)) ?? "null")?.role === role) sessionStorage.removeItem(key(account)); } catch { sessionStorage.removeItem(key(account)); }
    if (pairing) sessionStorage.setItem(key(account, role), JSON.stringify(pairing));
    else sessionStorage.removeItem(key(account, role));
    window.dispatchEvent(new Event(event));
  }
  return [pairing, setPairing] as const;
}
