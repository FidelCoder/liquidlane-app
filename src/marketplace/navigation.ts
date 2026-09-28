import { useSyncExternalStore } from "react";

export type WorkspaceRole = "merchant" | "provider";
export type ConsoleLocation = "home" | "merchant" | "merchant/nodes" | "merchant/orders" | "lp" | "lp/orders" | "portfolio";
const locations: ConsoleLocation[] = ["home", "merchant", "merchant/nodes", "merchant/orders", "lp", "lp/orders", "portfolio"];
const key = "liquidlane:console:location";
const event = "liquidlane-console-changed";
function subscribe(listener: () => void) {
  window.addEventListener(event, listener);
  window.addEventListener("hashchange", listener);
  window.addEventListener("popstate", listener);
  return () => { window.removeEventListener(event, listener); window.removeEventListener("hashchange", listener); window.removeEventListener("popstate", listener); };
}
function snapshot(): ConsoleLocation {
  const hash = window.location.hash.slice(1);
  if (["services", "how-it-works"].includes(hash)) return "home";
  if (hash === "vault") return "portfolio";
  const value = hash || sessionStorage.getItem(key);
  return locations.includes(value as ConsoleLocation) ? value as ConsoleLocation : "home";
}
export function useConsoleNavigation() {
  const location = useSyncExternalStore(subscribe, snapshot, () => "home" as ConsoleLocation);
  const navigate = (next: ConsoleLocation) => {
    sessionStorage.setItem(key, next);
    window.history.pushState(null, "", `${window.location.pathname}${window.location.search}#${next}`);
    window.dispatchEvent(new Event(event));
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  return [location, navigate] as const;
}
