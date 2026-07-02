"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  Landmark,
  Loader2,
  LogOut,
  RadioTower,
  Route,
  ShieldCheck,
  UserRound,
  Waves,
} from "lucide-react";

type Role = "lp" | "merchant" | "operator";

type UserProfile = {
  id: string;
  display_name: string;
  wallet_address: string;
  role: Role;
};

type ChallengeResponse = {
  challenge_id: string;
  message: string;
  expires_at: string;
};

type AuthResponse = {
  token: string;
  user: UserProfile;
};

type VaultSummary = {
  asset: string;
  total_deposits: number;
  reserved_liquidity: number;
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
  routing_fee_bps: number;
  status: "requested" | "deployed";
  channel_id: string | null;
  created_at: string;
};

type LiquidityQuote = {
  asset: string;
  amount: number;
  duration_days: number;
  lease_fee: number;
  routing_fee_bps: number;
  available: boolean;
  available_liquidity: number;
};

type ActivityEvent = {
  id: string;
  label: string;
  amount: number | null;
  asset: string | null;
  created_at: string;
};

type Dashboard = {
  user: UserProfile;
  vault: VaultSummary;
  deposits: Deposit[];
  liquidity_requests: LiquidityRequest[];
  activity: ActivityEvent[];
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";
const TOKEN_KEY = "liquidlane_token";
const WALLET_KEY = "liquidlane_wallet";
const roles: Array<{ value: Role; label: string; description: string }> = [
  { value: "lp", label: "Liquidity Provider", description: "Deposit stablecoins and track vault yield." },
  { value: "merchant", label: "Merchant", description: "Request receive capacity for Fiber payments." },
  { value: "operator", label: "Operator", description: "Manage both deposits and capacity deployments." },
];

type EthereumProvider = {
  request<T = unknown>(args: { method: string; params?: unknown[] }): Promise<T>;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export default function Home() {
  const [token, setToken] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [quote, setQuote] = useState<LiquidityQuote | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [status, setStatus] = useState("Connect a wallet and sign a LiquidLane challenge to continue.");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const request = useCallback(
    async function request<T>(path: string, init?: RequestInit): Promise<T> {
      const response = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(init?.headers ?? {}),
        },
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: "Request failed" }));
        throw new Error(body.error ?? "Request failed");
      }

      return response.json();
    },
    [token],
  );

  const refresh = useCallback(
    async function refresh(activeToken = token) {
      if (!activeToken) return;
      setLoading(true);
      try {
        const response = await fetch(`${API_BASE}/dashboard?asset=USDC`, {
          headers: { Authorization: `Bearer ${activeToken}` },
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({ error: "Could not load dashboard" }));
          throw new Error(body.error ?? "Could not load dashboard");
        }
        const data: Dashboard = await response.json();
        setDashboard(data);
        setToken(activeToken);
        window.localStorage.setItem(TOKEN_KEY, activeToken);
        setStatus("Connected to LiquidLane Core.");
      } catch (error) {
        setDashboard(null);
        setStatus(error instanceof Error ? error.message : "Could not connect to LiquidLane Core.");
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    const saved = window.localStorage.getItem(TOKEN_KEY);
    if (saved) {
      setToken(saved);
      refresh(saved);
    }
  }, [refresh]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const role = form.get("role") as Role;
    const displayName = String(form.get("display_name") ?? "").trim();
    setBusy("auth");
    try {
      if (!window.ethereum) {
        throw new Error("No injected wallet found. Install a browser wallet to sign in.");
      }
      const accounts = await window.ethereum.request<string[]>({ method: "eth_requestAccounts" });
      const wallet = accounts[0];
      if (!wallet) {
        throw new Error("Wallet did not return an account.");
      }
      setWalletAddress(wallet);
      window.localStorage.setItem(WALLET_KEY, wallet);

      const challengeResponse = await fetch(`${API_BASE}/auth/challenge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet_address: wallet, role }),
      });
      if (!challengeResponse.ok) {
        const body = await challengeResponse.json().catch(() => ({ error: "Challenge failed" }));
        throw new Error(body.error ?? "Challenge failed");
      }
      const challenge: ChallengeResponse = await challengeResponse.json();
      const signature = await window.ethereum.request<string>({
        method: "personal_sign",
        params: [challenge.message, wallet],
      });

      const verifyResponse = await fetch(`${API_BASE}/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challenge_id: challenge.challenge_id,
          wallet_address: wallet,
          signature,
          display_name: displayName || undefined,
        }),
      });
      if (!verifyResponse.ok) {
        const body = await verifyResponse.json().catch(() => ({ error: "Wallet verification failed" }));
        throw new Error(body.error ?? "Wallet verification failed");
      }
      const data: AuthResponse = await verifyResponse.json();
      setToken(data.token);
      window.localStorage.setItem(TOKEN_KEY, data.token);
      setStatus(`Wallet verified: ${shortAddress(data.user.wallet_address)}.`);
      await refresh(data.token);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not verify wallet session.");
    } finally {
      setBusy(null);
    }
  }

  function signOut() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(WALLET_KEY);
    setToken(null);
    setWalletAddress(null);
    setDashboard(null);
    setQuote(null);
    setStatus("Signed out.");
  }

  async function handleDeposit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy("deposit");
    try {
      await request<Deposit>("/deposits", {
        method: "POST",
        body: JSON.stringify({
          asset: form.get("asset"),
          amount: Number(form.get("amount")),
        }),
      });
      event.currentTarget.reset();
      setStatus("Liquidity deposit recorded.");
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Deposit failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      asset: form.get("asset"),
      amount: Number(form.get("amount")),
      duration_days: Number(form.get("duration_days")),
    };
    setBusy("request");
    try {
      const quoteData = await request<LiquidityQuote>("/liquidity/quote", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setQuote(quoteData);
      if (!quoteData.available) {
        setStatus(`Only ${money(quoteData.available_liquidity)} ${quoteData.asset} is available.`);
        return;
      }
      await request<LiquidityRequest>("/liquidity/requests", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      event.currentTarget.reset();
      setStatus("Capacity request reserved.");
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Capacity request failed.");
    } finally {
      setBusy(null);
    }
  }

  async function deploy(id: string) {
    setBusy(id);
    try {
      await request<LiquidityRequest>(`/liquidity/requests/${id}/deploy`, { method: "POST" });
      setStatus("Fiber channel capacity deployed.");
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Deployment failed.");
    } finally {
      setBusy(null);
    }
  }

  const vault = dashboard?.vault;
  const utilization = useMemo(() => {
    if (!vault || vault.total_deposits === 0) return 0;
    return Math.round(((vault.reserved_liquidity + vault.deployed_liquidity) / vault.total_deposits) * 100);
  }, [vault]);
  const canDeposit = dashboard?.user.role === "lp" || dashboard?.user.role === "operator";
  const canRequest = dashboard?.user.role === "merchant" || dashboard?.user.role === "operator";

  return (
    <main className="app-shell">
      <nav className="topbar" aria-label="Primary navigation">
        <div className="brand">
          <span className="brand-mark"><Waves size={18} /></span>
          <span>LiquidLane</span>
        </div>
        {dashboard ? (
          <div className="nav-actions">
            <a href="#vault">Vault</a>
            <a href="#requests">Requests</a>
            <button type="button" onClick={() => refresh()}>{loading ? <Loader2 className="spin" size={16} /> : <RadioTower size={16} />} Sync</button>
            <button type="button" className="secondary-button" onClick={signOut}><LogOut size={16} /> Sign out</button>
          </div>
        ) : null}
      </nav>

      {!dashboard ? (
        <section className="auth-layout">
          <div className="auth-copy">
            <p className="eyebrow">Live product access</p>
            <h1>Operate stablecoin liquidity for Fiber channels.</h1>
            <p className="lede">Connect your wallet, choose a role, and sign a one-time challenge. LiquidLane only shows live backend data and will not silently load fake records.</p>
            <div className="status-strip"><RadioTower size={16} /> {status}</div>
          </div>
          <form className="auth-panel" onSubmit={signIn}>
            <h2>Wallet session</h2>
            <label>Display name<input name="display_name" placeholder="Atlas LP" /></label>
            <div className="wallet-preview">{walletAddress ? shortAddress(walletAddress) : "No wallet connected yet"}</div>
            <div className="role-grid">
              {roles.map((role) => (
                <label key={role.value} className="role-card">
                  <input name="role" type="radio" value={role.value} defaultChecked={role.value === "operator"} />
                  <strong>{role.label}</strong>
                  <span>{role.description}</span>
                </label>
              ))}
            </div>
            <button type="submit" disabled={busy === "auth"}>{busy === "auth" ? <Loader2 className="spin" size={16} /> : <UserRound size={16} />} Connect + sign</button>
          </form>
        </section>
      ) : (
        <>
          <section className="hero dashboard-hero">
            <div className="hero-copy">
              <p className="eyebrow">{dashboard.user.role} workspace</p>
              <h1>Liquidity capacity with live vault accounting.</h1>
              <p className="lede">Deposits, reserves, deployments, and fees are written to LiquidLane Core and persisted locally.</p>
              <div className="status-strip"><UserRound size={16} /> {dashboard.user.display_name} · {shortAddress(dashboard.user.wallet_address)}</div>
              <p className="notice">{status}</p>
            </div>

            <div className="operation-panel" aria-label="LiquidLane vault overview">
              <div className="panel-header">
                <span>{vault?.asset ?? "USDC"} Vault</span>
                <strong>{utilization}% used</strong>
              </div>
              <div className="meter" aria-hidden="true"><span style={{ width: `${Math.max(utilization, 2)}%` }} /></div>
              <div className="metric-grid">
                <Metric label="Total deposits" value={money(vault?.total_deposits ?? 0)} />
                <Metric label="Available" value={money(vault?.available_liquidity ?? 0)} />
                <Metric label="Reserved" value={money(vault?.reserved_liquidity ?? 0)} />
                <Metric label="Deployed" value={money(vault?.deployed_liquidity ?? 0)} />
                <Metric label="Fees earned" value={money(vault?.fees_earned ?? 0)} />
                <Metric label="LPs" value={String(vault?.lp_count ?? 0)} />
              </div>
            </div>
          </section>

          <section className="product-grid" id="vault">
            <article className={!canDeposit ? "disabled-card" : ""}>
              <span className="icon"><CircleDollarSign size={20} /></span>
              <h2>Deposit liquidity</h2>
              {canDeposit ? (
                <form className="stack-form" onSubmit={handleDeposit}>
                  <label>Asset<input name="asset" defaultValue="USDC" required /></label>
                  <label>Amount<input name="amount" type="number" min="1" placeholder="25000" required /></label>
                  <button type="submit" disabled={busy === "deposit"}>{busy === "deposit" ? <Loader2 className="spin" size={16} /> : <Banknote size={16} />} Deposit</button>
                </form>
              ) : <p className="muted">Switch to LP or operator role to deposit vault liquidity.</p>}
            </article>

            <article className={!canRequest ? "disabled-card" : ""}>
              <span className="icon"><Route size={20} /></span>
              <h2>Request capacity</h2>
              {canRequest ? (
                <form className="stack-form" onSubmit={handleRequest}>
                  <label>Asset<input name="asset" defaultValue="USDC" required /></label>
                  <div className="form-row">
                    <label>Amount<input name="amount" type="number" min="1" placeholder="10000" required /></label>
                    <label>Days<input name="duration_days" type="number" min="1" defaultValue="30" required /></label>
                  </div>
                  <button type="submit" disabled={busy === "request"}>{busy === "request" ? <Loader2 className="spin" size={16} /> : <ArrowRight size={16} />} Quote + reserve</button>
                </form>
              ) : <p className="muted">Switch to merchant or operator role to request receive capacity.</p>}
            </article>

            <article>
              <span className="icon"><ShieldCheck size={20} /></span>
              <h2>Quote result</h2>
              {quote ? (
                <div className="quote-box">
                  <Metric label="Capacity" value={money(quote.amount)} />
                  <Metric label="Lease fee" value={money(quote.lease_fee)} />
                  <Metric label="Routing fee" value={`${quote.routing_fee_bps} bps`} />
                  <div className="status-tag" data-status={quote.available ? "deployed" : "requested"}>{quote.available ? "available" : "insufficient"}</div>
                </div>
              ) : <p className="muted">Submit a capacity request to calculate a quote against live vault liquidity.</p>}
            </article>
          </section>

          <section className="split-section" id="requests">
            <div className="table-panel">
              <div className="section-title">
                <div>
                  <p className="eyebrow">Liquidity lifecycle</p>
                  <h2>Capacity requests</h2>
                </div>
                <span>{dashboard.liquidity_requests.length} total</span>
              </div>
              <div className="request-list">
                {dashboard.liquidity_requests.length ? dashboard.liquidity_requests.map((request) => (
                  <div className="request-card" key={request.id}>
                    <div>
                      <strong>{request.merchant_name}</strong>
                      <span>{money(request.amount)} {request.asset} · {request.duration_days} days · fee {money(request.lease_fee)}</span>
                    </div>
                    <div>
                      <span className="status-tag" data-status={request.status}>{request.status}</span>
                      {request.status === "requested" && canRequest ? (
                        <button type="button" onClick={() => deploy(request.id)} disabled={busy === request.id}>
                          {busy === request.id ? <Loader2 className="spin" size={16} /> : <CheckCircle2 size={16} />} Deploy
                        </button>
                      ) : request.channel_id ? <code>{request.channel_id}</code> : null}
                    </div>
                  </div>
                )) : <EmptyState title="No capacity requests yet" text="Create a request after liquidity has been deposited into the vault." />}
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
                {dashboard.activity.length ? dashboard.activity.map((event) => (
                  <div key={event.id}>
                    <span><Landmark size={16} /></span>
                    <p>{event.label}<strong>{event.amount ? ` ${money(event.amount)} ${event.asset ?? ""}` : ""}</strong></p>
                  </div>
                )) : <EmptyState title="No activity yet" text="Actions you take in the product will appear here." />}
              </div>
            </div>
          </section>

          <section className="trust-row">
            <div><Landmark size={18} /> Authenticated vault accounting</div>
            <div><ShieldCheck size={18} /> Live capacity reservations</div>
          </section>
        </>
      )}
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

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <span>{text}</span>
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


function shortAddress(address: string) {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
