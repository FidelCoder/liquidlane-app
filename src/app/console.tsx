"use client";

import type { ReactNode } from "react";
import { CircleDollarSign, Droplet, Landmark, RefreshCw, Store } from "lucide-react";
import type { ConsoleLocation } from "@/marketplace/navigation";

type Props = { location: ConsoleLocation; onNavigate: (location: ConsoleLocation) => void; walletControls: ReactNode; notices: ReactNode; children: ReactNode; onRefresh: () => void; refreshing: boolean; connected: boolean };
const services = [
  { target: "lp", label: "Supply Liquidity", icon: CircleDollarSign },
  { target: "merchant", label: "Request Capacity", icon: Store },
  { target: "portfolio", label: "Portfolio", icon: Landmark },
] as const;

// Retains the original console navigation, proportions, and panel design.
export function ConsoleApp({ location, onNavigate, walletControls, notices, children, onRefresh, refreshing, connected }: Props) {
  const merchant = location.startsWith("merchant"), provider = location.startsWith("lp");
  const title = location === "merchant/nodes" ? "My Receiving Nodes" : location === "merchant/orders" ? "My Capacity Requests" : merchant ? "Request Capacity" : location === "lp/orders" ? "Merchant Requests" : provider ? "Supply Liquidity" : "Portfolio";
  const description = merchant ? "You buy capacity so your own Fiber node can receive payments." : provider ? "Connect your Fiber node, add CKB, and publish capacity for merchants." : "Your requests, supplied capacity, and opening fees across both roles.";
  const tabs: { target: ConsoleLocation; label: string }[] = merchant ? [
    { target: "merchant", label: "Find a provider" }, { target: "merchant/nodes", label: "My receiving nodes" }, { target: "merchant/orders", label: "My requests" },
  ] : provider ? [{ target: "lp", label: "My offers & nodes" }, { target: "lp/orders", label: "Merchant requests" }] : [];
  return <main className="console-shell"><section className="console-main">
    <header className="console-topbar">
      <button className="console-home-brand" onClick={() => onNavigate("home")} aria-label="Back to LiquidLane home"><Droplet size={22} /><strong>LiquidLane</strong></button>
      <nav className="console-tabs" aria-label="LiquidLane services">{services.map(({ target, label, icon: Icon }) => <button key={target} type="button" data-active={target === "merchant" ? merchant : target === "lp" ? provider : !merchant && !provider} onClick={() => onNavigate(target)}><Icon size={16} /><span>{label}</span></button>)}</nav>
      {walletControls}
    </header>
    <div className="console-content marketplace-console" data-role={merchant ? "merchant" : provider ? "provider" : "all"}>
      <section className="console-hero-strip"><div><p className="eyebrow">{merchant ? "Your role · Merchant" : provider ? "Your role · Liquidity provider" : "Your wallet activity"}</p><h1>{title}</h1><p>{description}</p></div><span className="workspace-network"><i data-online={connected} />CKB testnet</span></section>
      <nav className="workspace-tabs" aria-label={merchant ? "Merchant workspace" : provider ? "Provider workspace" : "Portfolio controls"}>{tabs.map(tab => <button key={tab.target} aria-current={location === tab.target ? "page" : undefined} onClick={() => onNavigate(tab.target)}>{tab.label}</button>)}<button className="refresh-control" onClick={onRefresh} disabled={refreshing} aria-label="Refresh workspace"><RefreshCw size={16} /><span>Refresh</span></button></nav>
      {notices}
      {children}
      <footer className="console-footer"><span>LiquidLane</span><span>{merchant ? "You receive capacity. Providers fund your channel." : provider ? "You provide capacity. Merchants pay your opening fee." : "Your nodes. Your payments."}</span><span>Built on Nervos CKB & Fiber Network</span></footer>
    </div>
  </section></main>;
}
