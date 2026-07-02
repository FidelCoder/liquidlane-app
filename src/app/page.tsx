import { ArrowRight, Banknote, CircleDollarSign, Landmark, Route, ShieldCheck, Waves } from "lucide-react";

const metrics = [
  { label: "Vault liquidity", value: "$125k" },
  { label: "Deployed capacity", value: "$25k" },
  { label: "LP fee yield", value: "$250" },
];

const flows = [
  "LPs deposit stablecoin liquidity",
  "Merchants request receive capacity",
  "LiquidLane deploys Fiber channels",
  "Fees return to the vault",
];

export default function Home() {
  return (
    <main className="app-shell">
      <nav className="topbar" aria-label="Primary navigation">
        <div className="brand">
          <span className="brand-mark"><Waves size={18} /></span>
          <span>LiquidLane</span>
        </div>
        <div className="nav-actions">
          <a href="#vault">Vault</a>
          <a href="#requests">Requests</a>
          <button type="button">Connect</button>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Fiber liquidity infrastructure</p>
          <h1>Stablecoin vaults for on-demand Fiber channel capacity.</h1>
          <p className="lede">
            LiquidLane lets liquidity providers earn from payment flow while merchants, wallets, and apps request the capacity they need to receive Fiber payments.
          </p>
          <div className="hero-actions">
            <button type="button">Request liquidity <ArrowRight size={16} /></button>
            <button type="button" className="secondary">Deposit liquidity</button>
          </div>
        </div>

        <div className="operation-panel" aria-label="LiquidLane vault overview">
          <div className="panel-header">
            <span>USDC Vault</span>
            <strong>Live capacity</strong>
          </div>
          <div className="meter" aria-hidden="true"><span /></div>
          <div className="metric-grid">
            {metrics.map((metric) => (
              <div key={metric.label}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="product-grid" id="vault">
        <article>
          <span className="icon"><CircleDollarSign size={20} /></span>
          <h2>Vault deposits</h2>
          <p>LPs deposit stablecoin liquidity into a shared vault that can be deployed into Fiber channels.</p>
        </article>
        <article>
          <span className="icon"><Route size={20} /></span>
          <h2>Capacity requests</h2>
          <p>Wallets and merchants request receive capacity by asset, amount, and duration.</p>
        </article>
        <article>
          <span className="icon"><Banknote size={20} /></span>
          <h2>Fee distribution</h2>
          <p>Lease and routing fees are tracked back to the vault so LPs earn from real payment usage.</p>
        </article>
      </section>

      <section className="workflow" id="requests">
        <div>
          <p className="eyebrow">MVP flow</p>
          <h2>From idle capital to usable payment capacity.</h2>
        </div>
        <ol>
          {flows.map((flow) => (
            <li key={flow}>{flow}</li>
          ))}
        </ol>
      </section>

      <section className="trust-row">
        <div><Landmark size={18} /> Stablecoin-first vault accounting</div>
        <div><ShieldCheck size={18} /> Channel deployment tracking</div>
      </section>
    </main>
  );
}
