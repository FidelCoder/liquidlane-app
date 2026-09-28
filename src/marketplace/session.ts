import { useMemo, useSyncExternalStore } from "react";
import type { ConnectedCkbWallet } from "@/lib/ckbWallet";

export type Session = { token: string; expires_at: number; wallet: ConnectedCkbWallet };
const key = "liquidlane:marketplace:session";
const changed = "liquidlane-session-changed";
function subscribe(listener: () => void) {
  window.addEventListener(changed, listener);
  window.addEventListener("storage", listener);
  return () => { window.removeEventListener(changed, listener); window.removeEventListener("storage", listener); };
}
function snapshot() { return sessionStorage.getItem(key); }
export function useSession() {
  const value = useSyncExternalStore(subscribe, snapshot, () => null);
  return useMemo(() => {
    try { return value ? JSON.parse(value) as Session : null; } catch { return null; }
  }, [value]);
}
export function storeSession(session: Session | null) {
  if (session) sessionStorage.setItem(key, JSON.stringify(session));
  else sessionStorage.removeItem(key);
  window.dispatchEvent(new Event(changed));
}
