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
import { connectCkbWallet, signCkbChallenge } from "@/lib/ckbWallet";

type Role = "lp" | "merchant" | "operator";
type LiquidityStatus = "requested" | "pending_fiber_channel" | "channel_open" | "failed";

type UserProfile = {
  id: string;
  display_name: string;
  ckb_address: string;
  wallet_type: string;
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
  pending_channel_liquidity: number;
  deployed_liquidity: number;
  available_liquidity: number;
  fees_earned: number;
  lp_count: number;
  active_requests: number;
};

type Deposit = {
  id: string;
  lp_name: string;
  ckb_address: string;
  asset: string;
  amount: number;
  created_at: string;
};

type LiquidityRequest = {
  id: string;
  merchant_name: string;
  ckb_address: string;
  asset: string;
  amount: number;
  duration_days: number;
  lease_fee: number;
  routing_fee_bps: number;
  fiber_peer_pubkey: string | null;
  status: LiquidityStatus;
  fiber_temporary_channel_id: string | null;
  channel_id: string | null;
  fiber_note: string | null;
  fiber_error: string | null;
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
const ADDRESS_KEY = "liquidlane_ckb_address";
const roles: Array<{ value: Role; label: string; description: string }> = [
  { value: "lp", label: "Liquidity Provider", description: "Deposit stablecoins and track vault yield." },
  { value: "merchant", label: "Merchant", description: "Request receive capacity for Fiber payments." },
  { value: "operator", label: "Operator", description: "Manage vault liquidity and Fiber channel opens." },
];

export default function Home() {
  const [token, setToken] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [quote, setQuote] = useState<LiquidityQuote | null>(null);
  const [ckbAddress, setCkbAddress] = useState<string | null>(null);
  const [status, setStatus] = useState("Connect a CKB wallet and sign a LiquidLane challenge to continue.");
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
        setCkbAddress(data.user.ckb_address);
        window.localStorage.setItem(TOKEN_KEY, activeToken);
        window.localStorage.setItem(ADDRESS_KEY, data.user.ckb_address);
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
    const savedToken = window.localStorage.getItem(TOKEN_KEY);
    const savedAddress = window.localStorage.getItem(ADDRESS_KEY);
    if (savedAddress) setCkbAddress(savedAddress);
    if (savedToken) {
      setToken(savedToken);
      refresh(savedToken);
    }
  }, [refresh]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const role = form.get("role") as Role;
    const displayName = String(form.get("display_name") ?? "").trim();
    setBusy("auth");
    try {
      const wallet = await connectCkbWallet();
      setCkbAddress(wallet.ckbAddress);
      window.localStorage.setItem(ADDRESS_KEY, wallet.ckbAddress);

      const challengeResponse = await fetch(`${API_BASE}/auth/challenge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ckb_address: wallet.ckbAddress,
          wallet_type: wallet.walletType,
          role,
        }),
      });
      if (!challengeResponse.ok) {
        const body = await challengeResponse.json().catch(() => ({ error: "Challenge failed" }));
        throw new Error(body.error ?? "Challenge failed");
      }
      const challenge: ChallengeResponse = await challengeResponse.json();
      const proof = await signCkbChallenge(challenge.message, wallet);

      const verifyResponse = await fetch(`${API_BASE}/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challenge_id: challenge.challenge_id,
          ckb_address: proof.ckbAddress,
          wallet_type: proof.walletType,
          signature: proof.signature,
          lock_script: proof.lockScript,
          display_name: displayName || undefined,
        }),
      });
      if (!verifyResponse.ok) {
        const body = await verifyResponse.json().catch(() => ({ error: "CKB wallet verification failed" }));
        throw new Error(body.error ?? "CKB wallet verification failed");
      }
      const data: AuthResponse = await verifyResponse.json();
      setToken(data.token);
      setCkbAddress(data.user.ckb_address);
      window.localStorage.setItem(TOKEN_KEY, data.token);
      window.localStorage.setItem(ADDRESS_KEY, data.user.ckb_address);
      setStatus(`CKB wallet verified: ${shortAddress(data.user.ckb_address)}.`);
      await refresh(data.token);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not verify CKB wallet session.");
    } finally {
      setBusy(null);
    }
  }

  function signOut() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(ADDRESS_KEY);
    setToken(null);
    setCkbAddress(null);
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
      setStatus("Vault liquidity recorded.");
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
      fiber_peer_pubkey: blankToUndefined(form.get("fiber_peer_pubkey")),
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
      setStatus("Capacity reserved. Open the Fiber channel when the peer is ready.");
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Capacity request failed.");
    } finally {
      setBusy(null);
    }
  }

  async function openFiberChannel(id: string) {
    setBusy(id);
    try {
      const updated = await request<LiquidityRequest>(`/liquidity/requests/${id}/deploy`, { method: "POST" });
      setStatus(statusMessage(updated));
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Fiber channel open failed.");
    } finally {
      setBusy(null);
    }
  }

  const vault = dashboard?.vault;
  const utilization = useMemo(() => {
    if (!vault || vault.total_deposits === 0) return 0;
    const used = vault.reserved_liquidity + vault.pending_channel_liquidity + vault.deployed_liquidity;
    return Math.round((used / vault.total_deposits) * 100);
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
            <p className="eyebrow">Fiber native access</p>
            <h1>Operate stablecoin liquidity for Fiber channels.</h1>
            <p className="lede">Connect JoyID on CKB, sign a LiquidLane challenge, and work with live Fiber channel state from Core.</p>
            <div className="status-strip"><RadioTower size={16} /> {status}</div>
          </div>
          <form className="auth-panel" onSubmit={signIn}>
            <h2>CKB wallet session</h2>
            <label>Display name<input name="display_name" placeholder="Atlas LP" /></label>
            <div className="wallet-preview">{ckbAddress ? shortAddress(ckbAddress) : "No CKB wallet connected yet"}</div>
            <div className="role-grid">
              {roles.map((role) => (
                <label key={role.value} className="role-card">
                  <input name="role" type="radio" value={role.value} defaultChecked={role.value === "operator"} />
                  <strong>{role.label}</strong>
                  <span>{role.description}</span>
                </label>
              ))}
            </div>
            <button type="submit" disabled={busy === "auth"}>{busy === "auth" ? <Loader2 className="spin" size={16} /> : <UserRound size={16} />} Connect JoyID</button>
          </form>
        </section>
      ) : (
        <>
          <section className="hero dashboard-hero">
            <div className="hero-copy">
              <p className="eyebrow">{dashboard.user.role} workspace</p>
              <h1>Fiber capacity with live vault accounting.</h1>
              <p className="lede">LiquidLane reserves vault liquidity, queues Fiber channel opens, and only marks capacity open when Core has a real channel state.</p>
              <div className="status-strip"><UserRound size={16} /> {dashboard.user.display_name} · {shortAddress(dashboard.user.ckb_address)}</div>
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
                <Metric label="Pending Fiber" value={money(vault?.pending_channel_liquidity ?? 0)} />
                <Metric label="Channel open" value={money(vault?.deployed_liquidity ?? 0)} />
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
                  <label>Fiber peer pubkey<input name="fiber_peer_pubkey" placeholder="02..." /></label>
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
                  <div className="status-tag" data-status={quote.available ? "available" : "failed"}>{quote.available ? "available" : "insufficient"}</div>
                </div>
              ) : <p className="muted">Submit a capacity request to calculate a quote against live vault liquidity.</p>}
            </article>
          </section>

          <section className="split-section" id="requests">
            <div className="table-panel">
              <div className="section-title">
                <div>
                  <p className="eyebrow">Fiber lifecycle</p>
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
                      {request.fiber_peer_pubkey ? <code>{shortPubkey(request.fiber_peer_pubkey)}</code> : <span>No Fiber peer pubkey attached</span>}
                      {request.fiber_note ? <span>{request.fiber_note}</span> : null}
                      {request.fiber_error ? <span className="error-text">{request.fiber_error}</span> : null}
                    </div>
                    <div>
                      <span className="status-tag" data-status={request.status}>{statusLabel(request.status)}</span>
                      {request.status === "requested" && canRequest ? (
                        <button type="button" onClick={() => openFiberChannel(request.id)} disabled={busy === request.id}>
                          {busy === request.id ? <Loader2 className="spin" size={16} /> : <CheckCircle2 size={16} />} Open Fiber
                        </button>
                      ) : request.channel_id ? <code>{request.channel_id}</code> : request.fiber_temporary_channel_id ? <code>{request.fiber_temporary_channel_id}</code> : null}
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
            <div><Landmark size={18} /> CKB wallet sessions</div>
            <div><ShieldCheck size={18} /> Fiber channel lifecycle</div>
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
  if (address.length <= 18) return address;
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function shortPubkey(pubkey: string) {
  const clean = pubkey.startsWith("0x") ? pubkey.slice(2) : pubkey;
  if (clean.length <= 18) return pubkey;
  return `${clean.slice(0, 10)}...${clean.slice(-8)}`;
}

function statusLabel(status: LiquidityStatus) {
  return status.replaceAll("_", " ");
}

function statusMessage(request: LiquidityRequest) {
  if (request.status === "pending_fiber_channel") return "Fiber channel open is pending with LiquidLane Core.";
  if (request.status === "channel_open") return "Fiber channel is open.";
  if (request.status === "failed") return request.fiber_error ?? "Fiber channel open failed.";
  return "Capacity request reserved.";
}

function blankToUndefined(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text ? text : undefined;
}
