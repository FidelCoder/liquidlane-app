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
  Sparkles,
  UserRound,
  Waves,
} from "lucide-react";
import { connectCkbWallet, signCkbChallenge, type ConnectedCkbWallet } from "@/lib/ckbWallet";

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

type Service = {
  role: Role;
  title: string;
  kicker: string;
  description: string;
  icon: typeof CircleDollarSign;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";
const TOKEN_KEY = "liquidlane_token";
const ADDRESS_KEY = "liquidlane_ckb_address";

const services: Service[] = [
  {
    role: "lp",
    title: "Supply liquidity",
    kicker: "For LPs",
    description: "Deposit stablecoin capacity and track how much of the vault is reserved for Fiber channels.",
    icon: CircleDollarSign,
  },
  {
    role: "merchant",
    title: "Request receive capacity",
    kicker: "For merchants",
    description: "Reserve liquidity, attach a Fiber peer pubkey, and queue a channel open when your node is ready.",
    icon: Route,
  },
  {
    role: "operator",
    title: "Operate lanes",
    kicker: "For node operators",
    description: "Manage vault accounting, capacity requests, and the Fiber channel-open lifecycle from one console.",
    icon: RadioTower,
  },
];

export default function Home() {
  const [token, setToken] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [quote, setQuote] = useState<LiquidityQuote | null>(null);
  const [wallet, setWallet] = useState<ConnectedCkbWallet | null>(null);
  const [ckbAddress, setCkbAddress] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [status, setStatus] = useState("Connect a CKB wallet to choose a LiquidLane service.");
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
        setSelectedRole(data.user.role);
        setCkbAddress(data.user.ckb_address);
        window.localStorage.setItem(TOKEN_KEY, activeToken);
        window.localStorage.setItem(ADDRESS_KEY, data.user.ckb_address);
        setStatus("Connected to LiquidLane Core.");
      } catch (error) {
        setDashboard(null);
        window.localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setStatus(error instanceof Error ? error.message : "Could not connect to LiquidLane Core.");
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    const savedToken = window.localStorage.getItem(TOKEN_KEY);
    if (savedToken) {
      setToken(savedToken);
      refresh(savedToken);
    }
  }, [refresh]);

  async function connectWallet() {
    setBusy("connect");
    try {
      const connected = await connectCkbWallet();
      setWallet(connected);
      setCkbAddress(connected.ckbAddress);
      window.localStorage.setItem(ADDRESS_KEY, connected.ckbAddress);
      setStatus("Wallet connected. Choose the service you want to use.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not connect CKB wallet.");
    } finally {
      setBusy(null);
    }
  }

  async function enterService(role: Role) {
    setSelectedRole(role);
    if (!wallet) {
      setStatus("Connect your CKB wallet before choosing a service.");
      return;
    }
    setBusy(role);
    try {
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
          display_name: displayName.trim() || undefined,
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
      setStatus(`Entered ${serviceLabel(role)} as ${shortAddress(data.user.ckb_address)}.`);
      await refresh(data.token);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not open the selected service.");
    } finally {
      setBusy(null);
    }
  }

  function signOut() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(ADDRESS_KEY);
    setToken(null);
    setWallet(null);
    setCkbAddress(null);
    setDashboard(null);
    setQuote(null);
    setSelectedRole(null);
    setStatus("Signed out. Connect a CKB wallet to choose a service.");
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
  const hasWalletSession = Boolean(wallet || dashboard);
  const utilization = useMemo(() => {
    if (!vault || vault.total_deposits === 0) return 0;
    const used = vault.reserved_liquidity + vault.pending_channel_liquidity + vault.deployed_liquidity;
    return Math.round((used / vault.total_deposits) * 100);
  }, [vault]);
  const canDeposit = dashboard?.user.role === "lp" || dashboard?.user.role === "operator";
  const canRequest = dashboard?.user.role === "merchant" || dashboard?.user.role === "operator";

  return (
    <main className="app-shell">
      <section className="landing-hero">
        <nav className="topbar landing-topbar" aria-label="Primary navigation">
          <div className="brand">
            <span className="brand-mark"><Waves size={18} /></span>
            <span>LiquidLane</span>
          </div>
          <div className="nav-actions">
            {dashboard ? <a href="#workspace">Workspace</a> : <a href="#services">Services</a>}
            <a href="#lifecycle">Lifecycle</a>
            {hasWalletSession && ckbAddress ? <span className="connected-pill"><UserRound size={15} /> {shortAddress(ckbAddress)}</span> : null}
            {hasWalletSession ? (
              <button type="button" className="secondary-button dark" onClick={signOut}><LogOut size={16} /> Disconnect</button>
            ) : (
              <button type="button" onClick={connectWallet} disabled={busy === "connect"}>
                {busy === "connect" ? <Loader2 className="spin" size={16} /> : <UserRound size={16} />} Connect wallet
              </button>
            )}
          </div>
        </nav>

        <div className="landing-content">
          <div className="landing-copy">
            <p className="eyebrow">Fiber liquidity infrastructure</p>
            <h1>Stablecoin capacity for payment channels, ready when apps need it.</h1>
            <p className="lede">LiquidLane gives LPs, merchants, and node operators one CKB-native lane for vault liquidity, receive capacity, and Fiber channel opens.</p>
            <div className="hero-actions">
              <button type="button" onClick={hasWalletSession ? () => document.getElementById("services")?.scrollIntoView({ behavior: "smooth" }) : connectWallet} disabled={busy === "connect"}>
                {busy === "connect" ? <Loader2 className="spin" size={16} /> : <ArrowRight size={16} />} {hasWalletSession ? "Choose service" : "Connect wallet"}
              </button>
              <a href="#lifecycle">View lifecycle</a>
            </div>
          </div>
          <div className="hero-metrics" aria-hidden="true">
            <div><span>Vault</span><strong>{money(vault?.total_deposits ?? 0)}</strong></div>
            <div><span>Available</span><strong>{money(vault?.available_liquidity ?? 0)}</strong></div>
            <div><span>Pending Fiber</span><strong>{money(vault?.pending_channel_liquidity ?? 0)}</strong></div>
          </div>
        </div>
      </section>

      <section className="service-section" id="services">
        <div className="section-heading">
          <p className="eyebrow">Choose service</p>
          <h2>{hasWalletSession ? "What do you want to do on LiquidLane?" : "Connect once, then choose the lane you need."}</h2>
          <p className="muted">{status}</p>
        </div>
        <div className="service-grid">
          {services.map((service) => {
            const Icon = service.icon;
            const active = selectedRole === service.role;
            return (
              <article className={active ? "service-card active" : "service-card"} key={service.role}>
                <span className="icon"><Icon size={21} /></span>
                <p className="eyebrow">{service.kicker}</p>
                <h3>{service.title}</h3>
                <p>{service.description}</p>
                {wallet && !dashboard ? (
                  <label>Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Atlas LP" /></label>
                ) : null}
                <button type="button" onClick={() => enterService(service.role)} disabled={(!wallet && dashboard?.user.role !== service.role) || busy === service.role}>
                  {busy === service.role ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />} {dashboard?.user.role === service.role ? "Current service" : wallet ? "Enter service" : "Connect first"}
                </button>
              </article>
            );
          })}
        </div>
      </section>

      {dashboard ? (
        <section className="workspace" id="workspace">
          <div className="workspace-head">
            <div>
              <p className="eyebrow">{dashboard.user.role} workspace</p>
              <h2>Live vault and Fiber capacity controls.</h2>
            </div>
            <button type="button" className="secondary-button" onClick={() => refresh()}>{loading ? <Loader2 className="spin" size={16} /> : <RadioTower size={16} />} Sync</button>
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

          <section className="split-section" id="lifecycle">
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
        </section>
      ) : (
        <section className="lifecycle-band" id="lifecycle">
          <div><Landmark size={18} /> CKB wallet session</div>
          <div><ShieldCheck size={18} /> Vault capacity accounting</div>
          <div><RadioTower size={18} /> Fiber channel lifecycle</div>
        </section>
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

function serviceLabel(role: Role) {
  return services.find((service) => service.role === role)?.title ?? role;
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
