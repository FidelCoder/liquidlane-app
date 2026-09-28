"use client";

import { ArrowRight, CircleDollarSign, Droplet, Network, RadioTower, ShieldCheck, Store } from "lucide-react";
import type { ReactNode } from "react";
import type { WorkspaceRole } from "@/marketplace/navigation";

type Props = { walletControls: ReactNode; notices: ReactNode; onEnter: (role: WorkspaceRole) => void; onPortfolio: () => void };

// The original landing structure and styles, adapted to participant-owned Fiber nodes.
export function Landing({ walletControls, notices, onEnter, onPortfolio }: Props) {
  return <main className="app-shell">
    <section className="landing-hero">
      <nav className="topbar landing-topbar" aria-label="Primary navigation">
        <a className="brand" href="#home" aria-label="LiquidLane home"><span className="brand-mark"><Droplet size={22} /></span><span>LiquidLane</span></a>
        <div className="landing-nav-links"><a className="active" href="#services">Services</a><a href="#how-it-works">How it works</a></div>
        <div className="nav-actions">{walletControls}</div>
      </nav>
      <div className="landing-notices">{notices}</div>
      <div className="landing-content">
        <div className="landing-copy">
          <p className="eyebrow">Liquidity markets for CKB · Testnet</p>
          <h1>The liquidity layer<span>for CKB and Fiber</span>payments.</h1>
          <p className="lede">Merchants buy capacity to receive payments. Liquidity providers fund channels from their own Fiber nodes.</p>
          <p className="yield-badge">Your node. Your keys. Direct payments.</p>
          <div className="hero-actions"><button onClick={() => onEnter("merchant")}><Store size={17} />Request capacity <ArrowRight size={16} /></button><button className="secondary-button dark" onClick={() => onEnter("provider")}><CircleDollarSign size={17} />Supply liquidity <ArrowRight size={16} /></button></div>
        </div>
      </div>
    </section>
    <section className="service-section" id="services">
      <div className="section-heading"><div><p className="eyebrow">Choose your role</p><h2>What do you want to do?</h2></div><p className="muted">Choose the service you need. You can switch between both with the same wallet.</p></div>
      <div className="service-grid">
        <article className="service-card" data-role="provider"><span className="icon"><CircleDollarSign size={23} /></span><p className="eyebrow">For liquidity providers</p><h3>Supply liquidity</h3><p>Fund your Fiber node and set your budget and opening fee. Merchants choose your offer; your node opens their channels automatically.</p><p className="service-outcome">You fund the channel. You receive the opening fee.</p><button onClick={() => onEnter("provider")}>Continue as a provider <ArrowRight size={17} /></button></article>
        <article className="service-card" data-role="merchant"><span className="icon"><Store size={23} /></span><p className="eyebrow">For merchants, wallets & apps</p><h3>Request receive capacity</h3><p>You want your Fiber node to receive payments. Choose a provider and buy capacity for your receiving node.</p><p className="service-outcome">You receive capacity. You pay the opening fee after delivery.</p><button onClick={() => onEnter("merchant")}>Continue as a merchant <ArrowRight size={17} /></button></article>
      </div>
    </section>
    <section className="roles-section" id="how-it-works" aria-label="Who does what">
      <div className="section-heading"><div><p className="eyebrow">Who does what</p><h2>Two node owners. One connection.</h2></div></div>
      <div className="role-explainer">
        <article><Store size={22} /><h3>The merchant</h3><p>Owns the receiving node, accepts a quote, and pays the provider after capacity is verified.</p></article>
        <article><CircleDollarSign size={22} /><h3>The liquidity provider</h3><p>Owns the funding node and sets its budget. Their connector signs quotes and funds accepted channels automatically.</p></article>
        <article><Network size={22} /><h3>LiquidLane</h3><p>Matches the two, coordinates signed quotes, and tracks opening, delivery, and payment.</p></article>
      </div>
      <p className="service-note">Both participants keep their node keys. Initial receive capacity is used as payments arrive; channel duration is not guaranteed.</p>
    </section>
    <section className="lifecycle-band"><div><ShieldCheck size={18} /> Participant-owned nodes</div><div><RadioTower size={18} /> CKB testnet · Fiber 0.9.0</div><button className="secondary-button dark" onClick={onPortfolio}>Open portfolio <ArrowRight size={16} /></button></section>
    <footer className="landing-footer">LiquidLane · Built on Nervos CKB & Fiber Network</footer>
  </main>;
}
