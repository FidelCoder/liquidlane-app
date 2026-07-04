"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  Landmark,
  ExternalLink,
  FileCode2,
  Loader2,
  LogOut,
  RadioTower,
  ReceiptText,
  Route,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  UserRound,
  Waves,
} from "lucide-react";
import { deployCkbScripts, type DeploymentResult } from "@/lib/ckbDeployment";
import {
  connectCkbWallet,
  openJoyIdPopup,
  signSupplyTransaction,
  type ConnectedCkbWallet,
} from "@/lib/ckbWallet";

type Role = "lp" | "merchant" | "operator";
type LiquidityStatus = "requested" | "pending_fiber_channel" | "channel_open" | "failed";

type UserProfile = {
  id: string;
  display_name: string;
  ckb_address: string;
  wallet_type: string;
  role: Role;
};

type AuthResponse = {
  token: string;
  user: UserProfile;
};

type VaultScripts = {
  vault_lock_code_hash: string | null;
  vault_type_code_hash: string | null;
  lp_receipt_type_code_hash: string | null;
  request_type_code_hash: string | null;
  fee_claim_type_code_hash: string | null;
};

type VaultConfig = {
  asset: string;
  address: string | null;
  network: string;
  configured: boolean;
  scripts?: VaultScripts;
};

type VaultSummary = VaultConfig & {
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
  tx_hash: string | null;
  created_at: string;
};

type IntentStatus = "pending_signature" | "settled" | "expired" | "cancelled";
type PositionStatus = "active" | "closed";
type ReservationStatus = "reserved" | "deployed" | "released" | "failed";

type SupplyIntent = {
  id: string;
  lp_id: string;
  lp_name: string;
  ckb_address: string;
  asset: string;
  amount: number;
  vault_address: string;
  receipt_cell_id: string;
  memo: string;
  status: IntentStatus;
  tx_hash: string | null;
  created_at: string;
  expires_at: string;
};

type LpPosition = {
  id: string;
  lp_id: string;
  lp_name: string;
  ckb_address: string;
  asset: string;
  supplied_amount: number;
  available_amount: number;
  reserved_amount: number;
  deployed_amount: number;
  fees_earned: number;
  fees_claimed: number;
  receipt_cell_id: string;
  supply_tx_hash: string;
  status: PositionStatus;
  created_at: string;
  updated_at: string;
};

type CapacityReservation = {
  id: string;
  request_id: string;
  merchant_id: string;
  merchant_name: string;
  ckb_address: string;
  asset: string;
  amount: number;
  lease_fee: number;
  request_cell_id: string;
  status: ReservationStatus;
  created_at: string;
  updated_at: string;
};

type WithdrawalIntent = {
  id: string;
  lp_id: string;
  lp_name: string;
  ckb_address: string;
  position_id: string;
  asset: string;
  amount: number;
  receipt_cell_id: string;
  memo: string;
  status: IntentStatus;
  tx_hash: string | null;
  created_at: string;
  expires_at: string;
};

type FeeClaim = {
  id: string;
  lp_id: string;
  position_id: string;
  asset: string;
  amount: number;
  memo: string;
  status: IntentStatus;
  tx_hash: string | null;
  created_at: string;
  expires_at: string;
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
  positions: LpPosition[];
  liquidity_requests: LiquidityRequest[];
  reservations: CapacityReservation[];
  withdrawals: WithdrawalIntent[];
  fee_claims: FeeClaim[];
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
const DEFAULT_ASSET = "CKB";
const TOKEN_KEY = "liquidlane_token";
const ADDRESS_KEY = "liquidlane_ckb_address";

const services: Service[] = [
  {
    role: "lp",
    title: "Supply liquidity",
    kicker: "For LPs",
    description: "Supply CKB vault capacity and track how much is reserved for Fiber channels.",
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
  const [activeVault, setActiveVault] = useState<VaultConfig | null>(null);
  const [quote, setQuote] = useState<LiquidityQuote | null>(null);
  const [deployment, setDeployment] = useState<DeploymentResult | null>(null);
  const [deploymentNotice, setDeploymentNotice] = useState<string | null>(null);
  const [wallet, setWallet] = useState<ConnectedCkbWallet | null>(null);
  const [ckbAddress, setCkbAddress] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [status, setStatus] = useState("Connect a CKB wallet to choose a LiquidLane service.");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);


  const loadVault = useCallback(async function loadVault() {
    try {
      const response = await fetch(`${API_BASE}/vault`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: "Could not load active vault" }));
        throw new Error(body.error ?? "Could not load active vault");
      }
      const vault: VaultConfig = await response.json();
      setActiveVault(vault);
      return vault;
    } catch (error) {
      setActiveVault(null);
      setStatus(error instanceof Error ? error.message : "Could not load active vault.");
      return null;
    }
  }, []);

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
        const response = await fetch(`${API_BASE}/dashboard?asset=${DEFAULT_ASSET}`, {
          headers: { Authorization: `Bearer ${activeToken}` },
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({ error: "Could not load dashboard" }));
          throw new Error(body.error ?? "Could not load dashboard");
        }
        const data: Dashboard = await response.json();
        setDashboard(data);
        setActiveVault(data.vault);
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
    loadVault();
    const savedToken = window.localStorage.getItem(TOKEN_KEY);
    if (savedToken) {
      setToken(savedToken);
      refresh(savedToken);
    }
  }, [loadVault, refresh]);

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
    setBusy(role);
    try {
      let activeWallet = wallet;
      if (!activeWallet) {
        activeWallet = await connectCkbWallet();
        setWallet(activeWallet);
        setCkbAddress(activeWallet.ckbAddress);
        window.localStorage.setItem(ADDRESS_KEY, activeWallet.ckbAddress);
      }

      const connectResponse = await fetch(`${API_BASE}/auth/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ckb_address: activeWallet.ckbAddress,
          wallet_type: activeWallet.walletType,
          role,
          lock_script: activeWallet.lockScript,
          display_name: displayName.trim() || undefined,
        }),
      });
      if (!connectResponse.ok) {
        const body = await connectResponse.json().catch(() => ({ error: "Could not open wallet session" }));
        throw new Error(body.error ?? "Could not open wallet session");
      }
      const data: AuthResponse = await connectResponse.json();
      setToken(data.token);
      setCkbAddress(data.user.ckb_address);
      window.localStorage.setItem(TOKEN_KEY, data.token);
      window.localStorage.setItem(ADDRESS_KEY, data.user.ckb_address);
      setStatus(`Opened ${serviceLabel(role)} for ${shortAddress(data.user.ckb_address)}.`);
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
    setDeployment(null);
    setDeploymentNotice(null);
    setSelectedRole(null);
    setStatus("Signed out. Connect a CKB wallet to choose a service.");
  }

  async function handleDeposit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const amount = Number(form.get("amount"));
    const asset = String(form.get("asset") ?? DEFAULT_ASSET).trim().toUpperCase();
    setBusy("deposit");
    try {
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Supply amount must be greater than zero.");
      }
      if (!activeVault?.configured || !activeVault.address?.trim()) {
        throw new Error("LiquidLane vault is not configured yet.");
      }

      let activeWallet = wallet;
      if (!activeWallet) {
        setStatus("Reconnect your CKB wallet to sign the supply transaction.");
        activeWallet = await connectCkbWallet();
        if (dashboard?.user.ckb_address && activeWallet.ckbAddress !== dashboard.user.ckb_address) {
          throw new Error("Connected wallet does not match this LiquidLane session.");
        }
        setWallet(activeWallet);
        setCkbAddress(activeWallet.ckbAddress);
        window.localStorage.setItem(ADDRESS_KEY, activeWallet.ckbAddress);
      }

      setStatus("Preparing the vault supply intent.");
      const intent = await request<SupplyIntent>("/vault/supply/intents", {
        method: "POST",
        body: JSON.stringify({ asset, amount }),
      });

      setStatus("Confirm the vault transaction in your CKB wallet.");
      const signed = await signSupplyTransaction(activeWallet, {
        asset,
        amount,
        to: intent.vault_address,
        memo: intent.memo,
      });

      await request<Deposit>("/deposits", {
        method: "POST",
        body: JSON.stringify({
          asset,
          amount,
          intent_id: intent.id,
          tx_hash: signed.txHash,
          signed_tx: signed.tx,
        }),
      });
      event.currentTarget.reset();
      setStatus(`Supplied ${assetAmount(amount, asset)} to ${shortAddress(intent.vault_address)}${signed.txHash ? ` (${shortHash(signed.txHash)})` : ""}.`);
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Supply failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      asset: String(form.get("asset") ?? DEFAULT_ASSET).trim().toUpperCase(),
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
        setStatus(`Only ${assetAmount(quoteData.available_liquidity, quoteData.asset)} is available.`);
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

  async function deployScriptsToTestnet() {
    setBusy("deploy-scripts");
    setDeploymentNotice("Opening JoyID and preparing deployment.");
    const popup = openJoyIdPopup();
    if (!popup) {
      setBusy(null);
      setDeploymentNotice("Browser blocked the JoyID popup. Enable popups for localhost and try again.");
      setStatus("Browser blocked the JoyID popup. Enable popups for localhost and try again.");
      return;
    }
    try {
      let activeWallet = wallet;
      if (!activeWallet) {
        setStatus("Reconnect your CKB wallet to sign the deployment transaction.");
        activeWallet = await connectCkbWallet();
        if (dashboard?.user.ckb_address && activeWallet.ckbAddress !== dashboard.user.ckb_address) {
          throw new Error("Connected wallet does not match this LiquidLane session.");
        }
        setWallet(activeWallet);
        setCkbAddress(activeWallet.ckbAddress);
        window.localStorage.setItem(ADDRESS_KEY, activeWallet.ckbAddress);
      }

      setStatus("Preparing CKB script deployment package.");
      const result = await deployCkbScripts(API_BASE, activeWallet, {
        popup,
        onProgress(step) {
          const message = deploymentStepMessage(step);
          setDeploymentNotice(message);
          setStatus(message);
        },
      });
      setDeployment(result);
      setDeploymentNotice(`Deployment broadcast ${shortHash(result.txHash)}. Track it on CKB testnet explorer.`);
      setStatus(`Deployment broadcast ${shortHash(result.txHash)}. Track it on CKB testnet explorer.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "CKB script deployment failed.";
      setDeploymentNotice(message);
      setStatus(message);
    } finally {
      setBusy(null);
    }
  }

  const vault = dashboard?.vault ?? activeVault;
  const vaultSummary = dashboard?.vault;
  const hasWalletSession = Boolean(wallet || dashboard);
  const utilization = useMemo(() => {
    if (!vaultSummary || vaultSummary.total_deposits === 0) return 0;
    const used = vaultSummary.reserved_liquidity + vaultSummary.pending_channel_liquidity + vaultSummary.deployed_liquidity;
    return Math.round((used / vaultSummary.total_deposits) * 100);
  }, [vaultSummary]);
  const showSupply = dashboard?.user.role === "lp" || dashboard?.user.role === "operator";
  const showRequest = dashboard?.user.role === "merchant" || dashboard?.user.role === "operator";
  const showDeploy = dashboard?.user.role === "operator";
  const vaultReady = Boolean(vault?.configured && vault.address);
  const claimableFees = dashboard?.positions.reduce((total, position) => total + Math.max(position.fees_earned - position.fees_claimed, 0), 0) ?? 0;

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
            <div><span>Vault</span><strong>{assetAmount(vaultSummary?.total_deposits ?? 0, vault?.asset ?? DEFAULT_ASSET)}</strong></div>
            <div><span>Available</span><strong>{assetAmount(vaultSummary?.available_liquidity ?? 0, vault?.asset ?? DEFAULT_ASSET)}</strong></div>
            <div><span>Network</span><strong>{vault?.network ?? "testnet"}</strong></div>
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
                <button type="button" onClick={() => enterService(service.role)} disabled={busy === service.role}>
                  {busy === service.role ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />} {dashboard?.user.role === service.role ? "Current service" : hasWalletSession ? "Open service" : "Connect + open"}
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
              <span>{vault?.asset ?? DEFAULT_ASSET} Vault</span>
              <strong>{utilization}% used</strong>
            </div>
            <div className="meter" aria-hidden="true"><span style={{ width: `${Math.max(utilization, 2)}%` }} /></div>
            <div className="metric-grid">
              <Metric label="Total supplied" value={assetAmount(vaultSummary?.total_deposits ?? 0, vault?.asset ?? DEFAULT_ASSET)} />
              <Metric label="Available" value={assetAmount(vaultSummary?.available_liquidity ?? 0, vault?.asset ?? DEFAULT_ASSET)} />
              <Metric label="Reserved" value={assetAmount(vaultSummary?.reserved_liquidity ?? 0, vault?.asset ?? DEFAULT_ASSET)} />
              <Metric label="Pending Fiber" value={assetAmount(vaultSummary?.pending_channel_liquidity ?? 0, vault?.asset ?? DEFAULT_ASSET)} />
              <Metric label="Channel open" value={assetAmount(vaultSummary?.deployed_liquidity ?? 0, vault?.asset ?? DEFAULT_ASSET)} />
              <Metric label="Fees earned" value={assetAmount(vaultSummary?.fees_earned ?? 0, vault?.asset ?? DEFAULT_ASSET)} />
              <Metric label="LPs" value={String(vaultSummary?.lp_count ?? 0)} />
            </div>
          </div>

          <section className="product-grid focused-grid" id="vault">
            {showSupply ? (
              <article>
                <span className="icon"><CircleDollarSign size={20} /></span>
                <h2>Supply liquidity</h2>
                <form className="stack-form" onSubmit={handleDeposit}>
                  <label>Asset<input name="asset" value={vault?.asset ?? DEFAULT_ASSET} readOnly required /></label>
                  <label>Amount<input name="amount" type="number" min="1" step="1" placeholder="100" required /></label>
                  <button type="submit" disabled={busy === "deposit" || !vaultReady}>{busy === "deposit" ? <Loader2 className="spin" size={16} /> : <Banknote size={16} />} Confirm supply</button>
                </form>
                {vaultReady && vault?.address ? <p className="muted compact-note">Active vault <code>{shortAddress(vault.address)}</code></p> : null}
                {!vaultReady ? <p className="muted compact-note">Vault setup is pending on Core.</p> : null}
              </article>
            ) : null}

            {showRequest ? (
              <article>
                <span className="icon"><Route size={20} /></span>
                <h2>Request capacity</h2>
                <form className="stack-form" onSubmit={handleRequest}>
                  <label>Asset<input name="asset" value={vault?.asset ?? DEFAULT_ASSET} readOnly required /></label>
                  <div className="form-row">
                    <label>Amount<input name="amount" type="number" min="1" placeholder="10000" required /></label>
                    <label>Days<input name="duration_days" type="number" min="1" defaultValue="30" required /></label>
                  </div>
                  <label>Fiber peer pubkey<input name="fiber_peer_pubkey" placeholder="02..." /></label>
                  <button type="submit" disabled={busy === "request"}>{busy === "request" ? <Loader2 className="spin" size={16} /> : <ArrowRight size={16} />} Quote + reserve</button>
                </form>
              </article>
            ) : null}

            {showRequest && quote ? (
              <article>
                <span className="icon"><ShieldCheck size={20} /></span>
                <h2>Quote result</h2>
                <div className="quote-box">
                  <Metric label="Capacity" value={assetAmount(quote.amount, quote.asset)} />
                  <Metric label="Lease fee" value={assetAmount(quote.lease_fee, quote.asset)} />
                  <Metric label="Routing fee" value={`${quote.routing_fee_bps} bps`} />
                  <div className="status-tag" data-status={quote.available ? "available" : "failed"}>{quote.available ? "available" : "insufficient"}</div>
                </div>
              </article>
            ) : null}

            {showDeploy ? (
              <article className="deployment-card">
                <span className="icon"><UploadCloud size={20} /></span>
                <h2>Deploy CKB scripts</h2>
                <div className="deployment-summary">
                  <Metric label="Network" value={vault?.network ?? "testnet"} />
                  <Metric label="Package" value="5 scripts" />
                  <Metric label="Signer" value={ckbAddress ? shortAddress(ckbAddress) : "JoyID"} />
                </div>
                <button type="button" onClick={deployScriptsToTestnet} disabled={busy === "deploy-scripts"}>
                  {busy === "deploy-scripts" ? <Loader2 className="spin" size={16} /> : <FileCode2 size={16} />} Deploy to testnet
                </button>
                {deploymentNotice ? <p className="deployment-notice">{deploymentNotice}</p> : null}
                {deployment ? (
                  <div className="deployment-record">
                    <div>
                      <span>Transaction</span>
                      <a href={deployment.explorerUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} /> {shortHash(deployment.txHash)}</a>
                    </div>
                    <div>
                      <span>Capacity</span>
                      <strong>{deployment.deployedCkb}</strong>
                    </div>
                    <div className="script-records">
                      {deployment.scripts.map((script) => (
                        <div key={script.name}>
                          <strong>{script.name}</strong>
                          <code>{shortHash(script.outPoint)}</code>
                          <code>{shortHash(script.codeHash)}</code>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </article>
            ) : null}
          </section>

          <section className="accounting-grid" aria-label="Vault accounting">
            <div className="table-panel">
              <div className="section-title">
                <div>
                  <p className="eyebrow">Vault positions</p>
                  <h2>LP receipts</h2>
                </div>
                <span>{dashboard.positions.length} active</span>
              </div>
              <div className="position-list">
                {dashboard.positions.length ? dashboard.positions.map((position) => (
                  <div className="position-card" key={position.id}>
                    <div className="position-main">
                      <span className="icon"><ReceiptText size={18} /></span>
                      <div>
                        <strong>{position.lp_name}</strong>
                        <span>{assetAmount(position.supplied_amount, position.asset)} supplied</span>
                        <code>{shortId(position.receipt_cell_id)}</code>
                      </div>
                    </div>
                    <div className="position-metrics">
                      <Metric label="Available" value={assetAmount(position.available_amount, position.asset)} />
                      <Metric label="Reserved" value={assetAmount(position.reserved_amount, position.asset)} />
                      <Metric label="Deployed" value={assetAmount(position.deployed_amount, position.asset)} />
                      <Metric label="Claimable fees" value={assetAmount(Math.max(position.fees_earned - position.fees_claimed, 0), position.asset)} />
                    </div>
                    <div className="position-footer">
                      <span className="status-tag" data-status={position.status}>{statusLabel(position.status)}</span>
                      <code>{shortHash(position.supply_tx_hash)}</code>
                    </div>
                  </div>
                )) : <EmptyState title="No LP positions" text="Supply liquidity to create a receipt-backed vault position." />}
              </div>
            </div>

            <div className="table-panel">
              <div className="section-title">
                <div>
                  <p className="eyebrow">Reservations</p>
                  <h2>Capacity locked</h2>
                </div>
                <span>{dashboard.reservations.length} total</span>
              </div>
              <div className="state-list">
                {dashboard.reservations.length ? dashboard.reservations.map((reservation) => (
                  <div className="state-row" key={reservation.id}>
                    <div>
                      <strong>{reservation.merchant_name}</strong>
                      <span>{assetAmount(reservation.amount, reservation.asset)} capacity · fee {assetAmount(reservation.lease_fee, reservation.asset)}</span>
                      <code>{shortId(reservation.request_cell_id)}</code>
                    </div>
                    <span className="status-tag" data-status={reservation.status}>{statusLabel(reservation.status)}</span>
                  </div>
                )) : <EmptyState title="No reservations" text="Merchant capacity requests reserve live vault liquidity here." />}
              </div>
            </div>

            <div className="table-panel">
              <div className="section-title">
                <div>
                  <p className="eyebrow">Settlement</p>
                  <h2>Claims and exits</h2>
                </div>
                <span>{assetAmount(claimableFees, vault?.asset ?? DEFAULT_ASSET)} claimable</span>
              </div>
              <div className="state-list">
                {dashboard.withdrawals.length || dashboard.fee_claims.length ? (
                  <>
                    {dashboard.withdrawals.map((withdrawal) => (
                      <div className="state-row" key={withdrawal.id}>
                        <div>
                          <strong>{withdrawal.lp_name}</strong>
                          <span>Withdrawal · {assetAmount(withdrawal.amount, withdrawal.asset)}</span>
                          <code>{shortId(withdrawal.receipt_cell_id)}</code>
                        </div>
                        <span className="status-tag" data-status={withdrawal.status}>{statusLabel(withdrawal.status)}</span>
                      </div>
                    ))}
                    {dashboard.fee_claims.map((claim) => (
                      <div className="state-row" key={claim.id}>
                        <div>
                          <strong>Fee claim</strong>
                          <span>{assetAmount(claim.amount, claim.asset)}</span>
                          <code>{shortId(claim.position_id)}</code>
                        </div>
                        <span className="status-tag" data-status={claim.status}>{statusLabel(claim.status)}</span>
                      </div>
                    ))}
                  </>
                ) : <EmptyState title="No settlement intents" text="Withdrawal and fee-claim intents appear after positions earn or exit liquidity." />}
              </div>
            </div>
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
                      <span>{assetAmount(request.amount, request.asset)} · {request.duration_days} days · fee {assetAmount(request.lease_fee, request.asset)}</span>
                      {request.fiber_peer_pubkey ? <code>{shortPubkey(request.fiber_peer_pubkey)}</code> : <span>No Fiber peer pubkey attached</span>}
                      {request.fiber_note ? <span>{request.fiber_note}</span> : null}
                      {request.fiber_error ? <span className="error-text">{request.fiber_error}</span> : null}
                    </div>
                    <div>
                      <span className="status-tag" data-status={request.status}>{statusLabel(request.status)}</span>
                      {request.status === "requested" && showRequest ? (
                        <button type="button" onClick={() => openFiberChannel(request.id)} disabled={busy === request.id}>
                          {busy === request.id ? <Loader2 className="spin" size={16} /> : <CheckCircle2 size={16} />} Open Fiber
                        </button>
                      ) : request.channel_id ? <code>{request.channel_id}</code> : request.fiber_temporary_channel_id ? <code>{request.fiber_temporary_channel_id}</code> : null}
                    </div>
                  </div>
                )) : <EmptyState title="No capacity requests yet" text="Create a request after liquidity has been supplied into the vault." />}
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
                    <p>{event.label}<strong>{event.amount ? ` ${assetAmount(event.amount, event.asset ?? DEFAULT_ASSET)}` : ""}</strong></p>
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

function assetAmount(value: number, asset: string) {
  if (asset.toUpperCase() === "CKB") {
    return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value)} CKB`;
  }
  return money(value);
}

function shortHash(hash: string) {
  if (hash.length <= 18) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-8)}`;
}

function shortId(id: string) {
  if (id.length <= 22) return id;
  return `${id.slice(0, 12)}...${id.slice(-8)}`;
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

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function deploymentStepMessage(step: "package" | "funding" | "signing" | "broadcast") {
  if (step === "package") return "Loading compiled CKB script package from Core.";
  if (step === "funding") return "Checking JoyID testnet cells for deployment capacity.";
  if (step === "signing") return "Confirm the raw CKB deployment transaction in JoyID.";
  return "Broadcasting deployment transaction to CKB testnet.";
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
