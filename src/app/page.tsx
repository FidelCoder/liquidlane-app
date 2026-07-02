"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  Landmark,
  Loader2,
  Plus,
  RadioTower,
  Route,
  ShieldCheck,
  Waves,
} from "lucide-react";

type VaultSummary = {
  asset: string;
  total_deposits: number;
  deployed_liquidity: number;
  available_liquidity: number;
  fees_earned: number;
  lp_count: number;
  active_requests: number;
};

type Deposit = {
  id: string;
  lp_name: string;
  asset: string;
  amount: number;
  created_at: string;
};

type LiquidityRequest = {
  id: string;
  merchant_name: string;
  asset: string;
  amount: number;
  duration_days: number;
  lease_fee: number;
  status: "requested" | "deployed";
  channel_id: string | null;
  created_at: string;
  updated_at: string;
};

type LiquidityQuote = {
  asset: string;
  amount: number;
  duration_days: number;
  lease_fee: number;
  routing_fee_bps: number;
  available: boolean;
};

type ActivityEvent = {
  id: string;
  label: string;
  amount: number | null;
  asset: string | null;
  created_at: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

const fallbackVault: VaultSummary = {
  asset: "USDC",
  total_deposits: 125000,
  deployed_liquidity: 25000,
  available_liquidity: 100000,
  fees_earned: 250,
  lp_count: 2,
  active_requests: 0,
};

const fallbackDeposits: Deposit[] = [
  {
    id: "deposit-1",
    lp_name: "Atlas LP",
    asset: "USDC",
    amount: 80000,
    created_at: new Date().toISOString(),
  },
  {
    id: "deposit-2",
    lp_name: "Northstar Capital",
    asset: "USDC",
    amount: 45000,
    created_at: new Date().toISOString(),
  },
];

const fallbackRequests: LiquidityRequest[] = [
  {
    id: "request-1",
    merchant_name: "Kairo Market",
    asset: "USDC",
    amount: 25000,
    duration_days: 30,
    lease_fee: 250,
    status: "deployed",
    channel_id: "fiber-channel-demo1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const fallbackActivity: ActivityEvent[] = [
  {
    id: "event-1",
    label: "Lease fee distributed to LP vault",
    amount: 250,
    asset: "USDC",
    created_at: new Date().toISOString(),
  },
  {
    id: "event-2",
    label: "Deployed channel capacity for Kairo Market",
    amount: 25000,
    asset: "USDC",
    created_at: new Date().toISOString(),
  },
];

export default function Home() {
  const [vault, setVault] = useState<VaultSummary>(fallbackVault);
  const [deposits, setDeposits] = useState<Deposit[]>(fallbackDeposits);
  const [requests, setRequests] = useState<LiquidityRequest[]>(fallbackRequests);
  const [activity, setActivity] = useState<ActivityEvent[]>(fallbackActivity);
  const [apiOnline, setApiOnline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [quote, setQuote] = useState<LiquidityQuote | null>(null);
  const [notice, setNotice] = useState("Demo data is loaded. Start LiquidLane Core to use live API actions.");

  const utilization = useMemo(() => {
    if (vault.total_deposits === 0) return 0;
    return Math.round((vault.deployed_liquidity / vault.total_deposits) * 100);
  }, [vault]);

  const request = useCallback(async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Request failed" }));
      throw new Error(body.error ?? "Request failed");
    }

    return response.json();
  }, []);

  const refresh = useCallback(async function refresh() {
    setLoading(true);
    try {
      const [vaultData, depositData, requestData, activityData] = await Promise.all([
        request<VaultSummary>("/vault?asset=USDC"),
        request<Deposit[]>("/deposits"),
        request<LiquidityRequest[]>("/liquidity/requests"),
        request<ActivityEvent[]>("/activity"),
      ]);

      setVault(vaultData);
      setDeposits(depositData);
      setRequests(requestData);
      setActivity(activityData);
      setApiOnline(true);
      setNotice("Connected to LiquidLane Core.");
    } catch {
      setVault(fallbackVault);
      setDeposits(fallbackDeposits);
      setRequests(fallbackRequests);
      setActivity(fallbackActivity);
      setApiOnline(false);
      setNotice("Demo data is loaded. Start LiquidLane Core to use live API actions.");
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleDeposit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy("deposit");

    try {
      await request<Deposit>("/deposits", {
        method: "POST",
        body: JSON.stringify({
          lp_name: form.get("lp_name"),
          asset: form.get("asset"),
          amount: Number(form.get("amount")),
        }),
      });
      event.currentTarget.reset();
      setNotice("Liquidity deposit recorded.");
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Deposit failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      merchant_name: form.get("merchant_name"),
      asset: form.get("asset"),
      amount: Number(form.get("amount")),
      duration_days: Number(form.get("duration_days")),
    };
    setBusy("quote");

    try {
      const quoteData = await request<LiquidityQuote>("/liquidity/quote", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setQuote(quoteData);

      await request<LiquidityRequest>("/liquidity/requests", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      event.currentTarget.reset();
      setNotice("Capacity request created.");
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Liquidity request failed.");
    } finally {
      setBusy(null);
    }
  }

  async function deploy(id: string) {
    setBusy(id);
    try {
      await request<LiquidityRequest>(`/liquidity/requests/${id}/deploy`, { method: "POST" });
      setNotice("Fiber channel capacity deployed.");
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Deployment failed.");
    } finally {
      setBusy(null);
    }
  }

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
          <button type="button" onClick={refresh}>{loading ? <Loader2 className="spin" size={16} /> : <RadioTower size={16} />} Refresh</button>
        </div>
      </nav>

      <section className="hero dashboard-hero">
        <div className="hero-copy">
          <p className="eyebrow">Fiber liquidity infrastructure</p>
          <h1>Stablecoin liquidity lanes for Fiber payment capacity.</h1>
          <p className="lede">
            LPs deposit stablecoins. Merchants and wallets request receive capacity. LiquidLane tracks the channel deployment and returns fees to the vault.
          </p>
          <div className="status-pill" data-online={apiOnline}>
            <span /> {apiOnline ? "Core API online" : "Demo mode"}
          </div>
          <p className="notice">{notice}</p>
        </div>

        <div className="operation-panel" aria-label="LiquidLane vault overview">
          <div className="panel-header">
            <span>{vault.asset} Vault</span>
            <strong>{utilization}% deployed</strong>
          </div>
          <div className="meter" aria-hidden="true"><span style={{ width: `${Math.max(utilization, 4)}%` }} /></div>
          <div className="metric-grid">
            <Metric label="Total deposits" value={money(vault.total_deposits)} />
            <Metric label="Available capacity" value={money(vault.available_liquidity)} />
            <Metric label="Fees earned" value={money(vault.fees_earned)} />
            <Metric label="LPs" value={String(vault.lp_count)} />
          </div>
        </div>
      </section>

      <section className="product-grid" id="vault">
        <article>
          <span className="icon"><CircleDollarSign size={20} /></span>
          <h2>LP vault</h2>
          <form className="stack-form" onSubmit={handleDeposit}>
            <label>LP name<input name="lp_name" placeholder="Atlas LP" required /></label>
            <label>Asset<input name="asset" defaultValue="USDC" required /></label>
            <label>Amount<input name="amount" type="number" min="1" placeholder="25000" required /></label>
            <button type="submit" disabled={busy === "deposit"}>{busy === "deposit" ? <Loader2 className="spin" size={16} /> : <Plus size={16} />} Deposit</button>
          </form>
        </article>

        <article>
          <span className="icon"><Route size={20} /></span>
          <h2>Request capacity</h2>
          <form className="stack-form" onSubmit={handleQuote}>
            <label>Merchant<input name="merchant_name" placeholder="Nova Wallet" required /></label>
            <label>Asset<input name="asset" defaultValue="USDC" required /></label>
            <div className="form-row">
              <label>Amount<input name="amount" type="number" min="1" placeholder="10000" required /></label>
              <label>Days<input name="duration_days" type="number" min="1" defaultValue="30" required /></label>
            </div>
            <button type="submit" disabled={busy === "quote"}>{busy === "quote" ? <Loader2 className="spin" size={16} /> : <ArrowRight size={16} />} Quote + request</button>
          </form>
        </article>

        <article>
          <span className="icon"><Banknote size={20} /></span>
          <h2>Latest quote</h2>
          {quote ? (
            <div className="quote-box">
              <Metric label="Capacity" value={money(quote.amount)} />
              <Metric label="Lease fee" value={money(quote.lease_fee)} />
              <Metric label="Routing fee" value={`${quote.routing_fee_bps} bps`} />
              <div className="status-pill compact" data-online={quote.available}><span /> {quote.available ? "Available" : "Insufficient"}</div>
            </div>
          ) : (
            <p className="muted">Create a capacity request to see a live quote.</p>
          )}
        </article>
      </section>

      <section className="split-section" id="requests">
        <div className="table-panel">
          <div className="section-title">
            <div>
              <p className="eyebrow">Liquidity lifecycle</p>
              <h2>Capacity requests</h2>
            </div>
            <span>{requests.length} total</span>
          </div>
          <div className="request-list">
            {requests.map((request) => (
              <div className="request-card" key={request.id}>
                <div>
                  <strong>{request.merchant_name}</strong>
                  <span>{money(request.amount)} {request.asset} for {request.duration_days} days</span>
                </div>
                <div>
                  <span className="status-tag" data-status={request.status}>{request.status}</span>
                  {request.status === "requested" ? (
                    <button type="button" onClick={() => deploy(request.id)} disabled={busy === request.id}>
                      {busy === request.id ? <Loader2 className="spin" size={16} /> : <CheckCircle2 size={16} />} Deploy
                    </button>
                  ) : (
                    <code>{request.channel_id}</code>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="table-panel">
          <div className="section-title">
            <div>
              <p className="eyebrow">Vault movement</p>
              <h2>Activity</h2>
            </div>
          </div>
          <div className="activity-list">
            {activity.map((event) => (
              <div key={event.id}>
                <span><Landmark size={16} /></span>
                <p>{event.label}<strong>{event.amount ? ` ${money(event.amount)} ${event.asset ?? ""}` : ""}</strong></p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="trust-row">
        <div><Landmark size={18} /> Stablecoin-first vault accounting</div>
        <div><ShieldCheck size={18} /> Fiber channel deployment tracking</div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}
