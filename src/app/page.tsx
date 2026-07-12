"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  Copy,
  Droplet,
  Landmark,
  Loader2,
  LogOut,
  RadioTower,
  Store,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { ConsoleApp, type ConsoleView } from "./console";
import { reserveVaultCapacity, type RequestProgressStep } from "@/lib/ckbRequest";
import { claimVaultFees, withdrawVaultLiquidity, type SettlementProgressStep } from "@/lib/ckbSettlement";
import { supplyVaultLiquidity, type SupplyProgressStep } from "@/lib/ckbSupply";
import {
  connectCkbWallet,
  openJoyIdPopup,
  showJoyIdPopupStatus,
  type ConnectedCkbWallet,
  type JoyIdPopup,
} from "@/lib/ckbWallet";

export type Role = "lp" | "merchant" | "operator";
export type LiquidityStatus = "requested" | "pending_fiber_channel" | "channel_open" | "failed";

export type UserProfile = {
  id: string;
  display_name: string;
  ckb_address: string;
  wallet_type: string;
  role: Role;
};

export type AuthResponse = {
  token: string;
  user: UserProfile;
};

export type VaultScripts = {
  vault_lock_code_hash: string | null;
  vault_lock_out_point: string | null;
  vault_type_code_hash: string | null;
  vault_type_out_point: string | null;
  lp_receipt_type_code_hash: string | null;
  lp_receipt_type_out_point: string | null;
  request_type_code_hash: string | null;
  request_type_out_point: string | null;
  fee_claim_type_code_hash: string | null;
  fee_claim_type_out_point: string | null;
};

export type VaultConfig = {
  asset: string;
  address: string | null;
  cell_out_point?: string | null;
  network: string;
  configured: boolean;
  scripts?: VaultScripts;
};

export type VaultSummary = VaultConfig & {
  total_deposits: number;
  reserved_liquidity: number;
  pending_channel_liquidity: number;
  deployed_liquidity: number;
  available_liquidity: number;
  fees_earned: number;
  lp_count: number;
  active_requests: number;
};

export type Deposit = {
  id: string;
  lp_name: string;
  ckb_address: string;
  asset: string;
  amount: number;
  tx_hash: string | null;
  created_at: string;
};

export type IntentStatus = "pending_signature" | "settled" | "expired" | "cancelled";
export type PositionStatus = "active" | "closed";
export type ReservationStatus = "reserved" | "deployed" | "released" | "failed";

export type SupplyIntent = {
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

export type LpPosition = {
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
  receipt_cell_out_point: string | null;
  supply_tx_hash: string;
  status: PositionStatus;
  created_at: string;
  updated_at: string;
};

export type CapacityReservation = {
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

export type WithdrawalIntent = {
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

export type FeeClaim = {
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

export type LiquidityRequest = {
  id: string;
  merchant_name: string;
  ckb_address: string;
  asset: string;
  amount: number;
  duration_days: number;
  lease_fee: number;
  routing_fee_bps: number;
  fiber_peer_pubkey: string | null;
  fiber_peer_address: string | null;
  request_cell_id: string;
  request_tx_hash: string | null;
  request_cell_out_point: string | null;
  status: LiquidityStatus;
  fiber_temporary_channel_id: string | null;
  channel_id: string | null;
  fiber_note: string | null;
  fiber_error: string | null;
  created_at: string;
};

export type LiquidityQuote = {
  asset: string;
  amount: number;
  duration_days: number;
  lease_fee: number;
  routing_fee_bps: number;
  available: boolean;
  available_liquidity: number;
};

export type RequestIntent = {
  id: string;
  merchant_id: string;
  merchant_name: string;
  ckb_address: string;
  asset: string;
  amount: number;
  duration_days: number;
  lease_fee: number;
  routing_fee_bps: number;
  fiber_peer_pubkey: string | null;
  fiber_peer_address: string | null;
  public_channel: boolean;
  request_cell_id: string;
  memo: string;
  status: IntentStatus;
  tx_hash: string | null;
  created_at: string;
  expires_at: string;
};

export type ActivityEvent = {
  id: string;
  label: string;
  amount: number | null;
  asset: string | null;
  created_at: string;
};

export type Dashboard = {
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

export type HealthStatus = {
  status: string;
  service: string;
  environment: string;
  fiber_rpc_configured: boolean;
  ckb_rpc_configured: boolean;
  ckb_network: string;
  vault_configured: boolean;
  beta_ready: boolean;
  executor_enabled: boolean;
  executor_funding_mode: string;
  executor_queued_requests: number;
  executor_pending_handoffs: number;
};

type PublicRole = Exclude<Role, "operator">;

type Service = {
  role: PublicRole;
  title: string;
  kicker: string;
  description: string;
  icon: typeof CircleDollarSign;
};

export type SupplyStepId = "vault" | "intent" | "funding" | "signing" | "verify" | "broadcast" | "settlement";
export type SupplyTxStatus = "running" | "ready" | "success" | "failed";

export type SupplyTxState = {
  status: SupplyTxStatus;
  step: SupplyStepId;
  title: string;
  message: string;
  amount?: number;
  asset?: string;
  txHash?: string;
  explorerUrl?: string;
  error?: string;
  diagnostics?: string[];
  probeStatus?: SupplyTxStatus;
  probeMessage?: string;
  probeDiagnostics?: string[];
  updatedAt: string;
};

export type ActionTxStatus = "running" | "ready" | "success" | "failed";

export type ActionTxState = {
  status: ActionTxStatus;
  title: string;
  message: string;
  action: "request" | "withdraw" | "claim" | "fiber";
  amount?: number;
  asset?: string;
  txHash?: string;
  explorerUrl?: string;
  details?: { label: string; value: string }[];
  error?: string;
  updatedAt: string;
};

type SupplyTxUpdate = Omit<SupplyTxState, "updatedAt">;
type ActionTxUpdate = Omit<ActionTxState, "updatedAt">;

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:18080";
const DEFAULT_ASSET = "CKB";
const EXPLORER_BASE = process.env.NEXT_PUBLIC_CKB_EXPLORER_URL ?? "https://pudge.explorer.nervos.org";
const TOKEN_KEY = "liquidlane_token";
const ADDRESS_KEY = "liquidlane_ckb_address";
const WALLET_KEY = "liquidlane_joyid_wallet";
const VIEW_KEY = "liquidlane_console_view";
const SURFACE_KEY = "liquidlane_surface";

type ConsoleSurface = "landing" | "console";
type NavigationState = { surface: ConsoleSurface; view: ConsoleView };

function normalizeConsoleView(value: string | null | undefined): ConsoleView | null {
  if (value === "lp" || value === "merchant" || value === "vault") return value;
  if (value === "operator") return "vault";
  return null;
}

function defaultViewForRole(role: Role): ConsoleView {
  if (role === "merchant") return "merchant";
  if (role === "operator") return "vault";
  return "lp";
}

function normalizeSurface(value: string | null | undefined): ConsoleSurface | null {
  if (value === "landing" || value === "console") return value;
  return null;
}

function readNavigationState(): NavigationState {
  if (typeof window === "undefined") return { surface: "landing", view: "lp" };
  const hash = window.location.hash.replace(/^#/, "");
  const hashView = normalizeConsoleView(hash);
  if (hashView) return { surface: "console", view: hashView };
  const storedView = normalizeConsoleView(window.localStorage.getItem(VIEW_KEY)) ?? "lp";
  const hashSurface = hash === "home" || hash === "services" || hash === "lifecycle" ? "landing" : null;
  return {
    surface: hashSurface ?? normalizeSurface(window.localStorage.getItem(SURFACE_KEY)) ?? "landing",
    view: storedView,
  };
}

function persistNavigationState(surface: ConsoleSurface, view: ConsoleView) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SURFACE_KEY, surface);
  window.localStorage.setItem(VIEW_KEY, view);
  const nextHash = surface === "landing" ? "home" : view;
  const nextUrl = `${window.location.pathname}${window.location.search}#${nextHash}`;
  window.history.replaceState(null, "", nextUrl);
}


function persistWalletSession(wallet: ConnectedCkbWallet) {
  window.localStorage.setItem(WALLET_KEY, JSON.stringify(wallet));
  window.localStorage.setItem(ADDRESS_KEY, wallet.ckbAddress);
}

function restoreWalletSession(): ConnectedCkbWallet | null {
  const raw = window.localStorage.getItem(WALLET_KEY);
  if (!raw) return null;
  try {
    const wallet = JSON.parse(raw) as ConnectedCkbWallet;
    if (!wallet?.ckbAddress || wallet.walletType !== "joyid_ckb" || !wallet.lockScript || !wallet.joyIdConnection) {
      return null;
    }
    return wallet;
  } catch {
    return null;
  }
}

function clearWalletSession() {
  window.localStorage.removeItem(WALLET_KEY);
  window.localStorage.removeItem(ADDRESS_KEY);
}

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
    icon: Store,
  },
];

export default function Home() {
  const [token, setToken] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [activeVault, setActiveVault] = useState<VaultConfig | null>(null);
  const [quote, setQuote] = useState<LiquidityQuote | null>(null);
  const [wallet, setWallet] = useState<ConnectedCkbWallet | null>(null);
  const [ckbAddress, setCkbAddress] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<PublicRole | null>(null);
  const [activeView, setActiveView] = useState<ConsoleView>(() => readNavigationState().view);
  const [surface, setSurface] = useState<ConsoleSurface>(() => readNavigationState().surface);
  const [fiberRpcConfigured, setFiberRpcConfigured] = useState(false);
  const [coreHealth, setCoreHealth] = useState<HealthStatus | null>(null);
  const [status, setStatus] = useState("Connect a CKB wallet to choose a LiquidLane service.");
  const [copiedWalletAddress, setCopiedWalletAddress] = useState(false);
  const loadHealth = useCallback(async function loadHealth() {
    try {
      const response = await fetch(`${API_BASE}/health`);
      if (!response.ok) throw new Error("Could not load Core health.");
      const health: HealthStatus = await response.json();
      setFiberRpcConfigured(Boolean(health.fiber_rpc_configured));
      setCoreHealth(health);
      return health;
    } catch {
      setFiberRpcConfigured(false);
      setCoreHealth(null);
      return null;
    }
  }, []);

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [supplyTx, setSupplyTx] = useState<SupplyTxState | null>(null);
  const [actionTx, setActionTx] = useState<ActionTxState | null>(null);

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
        await loadHealth();
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
        setSelectedRole(data.user.role === "merchant" || data.user.role === "lp" ? data.user.role : null);
        setActiveView((current) => normalizeConsoleView(current) ?? defaultViewForRole(data.user.role));
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
    [token, loadHealth],
  );

  useEffect(() => {
    const navigation = readNavigationState();
    setSurface(navigation.surface);
    setActiveView(navigation.view);
    loadVault();
    loadHealth();
    const restoredWallet = restoreWalletSession();
    const savedAddress = restoredWallet?.ckbAddress ?? window.localStorage.getItem(ADDRESS_KEY)?.trim();
    const savedToken = window.localStorage.getItem(TOKEN_KEY);
    if (restoredWallet) {
      setWallet(restoredWallet);
      setCkbAddress(restoredWallet.ckbAddress);
      setStatus("JoyID wallet restored. LiquidLane is syncing your portfolio.");
    } else if (savedAddress) {
      setCkbAddress(savedAddress);
      if (!savedToken) setStatus("Wallet address restored. Reconnect JoyID when a service needs a signature.");
    }
    if (savedToken) {
      setToken(savedToken);
      refresh(savedToken);
    }
  }, [loadHealth, loadVault, refresh]);

  useEffect(() => {
    function syncFromHash() {
      const navigation = readNavigationState();
      setSurface(navigation.surface);
      setActiveView(navigation.view);
    }

    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  function openConsoleView(view: ConsoleView) {
    setSurface("console");
    setActiveView(view);
    if (view !== "vault") setSelectedRole(view);
    persistNavigationState("console", view);
  }

  function openLandingPage() {
    setSurface("landing");
    persistNavigationState("landing", activeView);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function connectWallet() {
    setBusy("connect");
    const popup = openJoyIdPopup();
    if (!popup) {
      setBusy(null);
      setStatus("Browser blocked the JoyID popup. Enable popups for localhost and try again.");
      return;
    }

    try {
      setStatus(ckbAddress ? "Opening JoyID to reconnect your signer." : "Opening JoyID wallet.");
      const connected = await connectCkbWallet(popup);
      setWallet(connected);
      setCkbAddress(connected.ckbAddress);
      persistWalletSession(connected);
      setStatus("JoyID connected. Choose the service you want to use.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not connect CKB wallet.");
    } finally {
      setBusy(null);
    }
  }

  async function enterService(role: PublicRole) {
    setSelectedRole(role);
    openConsoleView(role);
    if (dashboard?.user.role === role) {
      openConsoleView(role);
      return;
    }

    setBusy(role);
    try {
      let activeWallet = wallet;
      if (!activeWallet) {
        const popup = openJoyIdPopup();
        if (!popup) {
          throw new Error("Browser blocked the JoyID popup. Enable popups for localhost and try again.");
        }
        setStatus("Opening JoyID to connect your signer.");
        activeWallet = await connectCkbWallet(popup);
        setWallet(activeWallet);
        setCkbAddress(activeWallet.ckbAddress);
        persistWalletSession(activeWallet);
      }

      const connectResponse = await fetch(`${API_BASE}/auth/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ckb_address: activeWallet.ckbAddress,
          wallet_type: activeWallet.walletType,
          role,
          lock_script: activeWallet.lockScript,
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
      openConsoleView(role);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not open the selected service.");
    } finally {
      setBusy(null);
    }
  }

  function signOut() {
    window.localStorage.removeItem(TOKEN_KEY);
    clearWalletSession();
    setToken(null);
    setWallet(null);
    setCkbAddress(null);
    setDashboard(null);
    setQuote(null);
    setSupplyTx(null);
    setActionTx(null);
    setCopiedWalletAddress(false);
    setSelectedRole(null);
    setActiveView("lp");
    setSurface("landing");
    window.localStorage.removeItem(VIEW_KEY);
    window.localStorage.removeItem(SURFACE_KEY);
    setStatus("Signed out. Connect a CKB wallet to choose a service.");
  }

  async function copyWalletAddress(address: string) {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedWalletAddress(true);
      setStatus("Wallet address copied.");
      window.setTimeout(() => setCopiedWalletAddress(false), 1500);
    } catch {
      setStatus("Could not copy wallet address.");
    }
  }

  function writeTimestamp() {
    return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function writeSupplyTx(update: SupplyTxUpdate) {
    setSupplyTx({
      ...update,
      updatedAt: writeTimestamp(),
    });
  }

  function writeActionTx(update: ActionTxUpdate) {
    setActionTx({
      ...update,
      updatedAt: writeTimestamp(),
    });
  }

  function patchSupplyTx(update: Partial<SupplyTxState>) {
    setSupplyTx((current) => current ? { ...current, ...update, updatedAt: writeTimestamp() } : current);
  }

  function errorDiagnostics(error: unknown) {
    if (error && typeof error === "object" && "diagnostics" in error) {
      const diagnostics = (error as { diagnostics?: unknown }).diagnostics;
      if (Array.isArray(diagnostics)) return diagnostics.filter((item): item is string => typeof item === "string");
    }
    return undefined;
  }

  function applyWithdrawalSnapshot(position: LpPosition, vaultBefore: VaultSummary, amount: number, txHash: string) {
    const now = new Date().toISOString();
    const expectedSupplied = Math.max(position.supplied_amount - amount, 0);
    const expectedAvailable = Math.max(position.available_amount - amount, 0);
    const expectedVaultTotal = Math.max(vaultBefore.total_deposits - amount, 0);
    const expectedVaultAvailable = Math.max(vaultBefore.available_liquidity - amount, 0);
    setDashboard((current) => {
      if (!current) return current;
      const positions = current.positions.map((item) => {
        if (item.id !== position.id) return item;
        const nextSupplied = Math.min(item.supplied_amount, expectedSupplied);
        const nextAvailable = Math.min(item.available_amount, expectedAvailable);
        const shouldClose = nextSupplied === 0 && item.reserved_amount === 0 && item.deployed_amount === 0;
        return {
          ...item,
          supplied_amount: nextSupplied,
          available_amount: nextAvailable,
          status: shouldClose ? "closed" : item.status,
          updated_at: now,
        };
      });
      const vault = {
        ...current.vault,
        total_deposits: Math.min(current.vault.total_deposits, expectedVaultTotal),
        available_liquidity: Math.min(current.vault.available_liquidity, expectedVaultAvailable),
      };
      return {
        ...current,
        vault,
        positions,
        activity: [
          {
            id: `local-withdrawal-${txHash}`,
            label: `${position.lp_name} withdrew vault liquidity`,
            amount,
            asset: position.asset,
            created_at: now,
          },
          ...current.activity.filter((event) => event.id !== `local-withdrawal-${txHash}`),
        ],
      };
    });
  }


  async function handleDeposit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const amount = Number(form.get("amount"));
    const asset = String(form.get("asset") ?? DEFAULT_ASSET).trim().toUpperCase();
    const progressTitle: Record<SupplyProgressStep, string> = {
      vault: "Checking vault",
      funding: "Selecting wallet cells",
      signing: "Waiting for JoyID",
      verify: "Dry-running transaction",
      broadcast: "Broadcasting transaction",
    };
    let currentStep: SupplyStepId = "vault";
    const safeAmount = Number.isFinite(amount) ? amount : undefined;
    const writeSupplyState = (update: SupplyTxUpdate) => {
      currentStep = update.step;
      writeSupplyTx(update);
    };

    setBusy("deposit");
    let signPopup: JoyIdPopup | undefined;
    try {
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Supply amount must be greater than zero.");
      }
      if (!activeVault?.configured || !activeVault.address?.trim()) {
        throw new Error("LiquidLane vault is not configured yet.");
      }

      writeSupplyState({
        status: "running",
        step: "vault",
        title: "Checking vault",
        message: "Loading live LiquidLane scripts and the current vault cell.",
        amount,
        asset,
      });

      let activeWallet = wallet;
      if (!activeWallet) {
        const popup = openJoyIdPopup();
        if (!popup) {
          throw new Error("Browser blocked the JoyID popup. Enable popups for localhost and try again.");
        }
        writeSupplyState({
          status: "running",
          step: "signing",
          title: "Reconnect signer",
          message: "JoyID needs to reconnect before LiquidLane can prepare the vault transaction.",
          amount,
          asset,
        });
        setStatus("Opening JoyID to reconnect your signer.");
        activeWallet = await connectCkbWallet(popup);
        if (dashboard?.user.ckb_address && activeWallet.ckbAddress !== dashboard.user.ckb_address) {
          throw new Error("Connected wallet does not match this LiquidLane session.");
        }
        setWallet(activeWallet);
        setCkbAddress(activeWallet.ckbAddress);
        persistWalletSession(activeWallet);
        writeSupplyState({
          status: "ready",
          step: "signing",
          title: "Signer reconnected",
          message: "Click Confirm supply again to sign the vault transaction.",
          amount,
          asset,
        });
        setStatus("JoyID reconnected. Click Confirm supply again to sign the vault transaction.");
        return;
      }

      signPopup = openJoyIdPopup();
      if (!signPopup) {
        throw new Error("Browser blocked the JoyID popup. Enable popups for localhost and try again.");
      }

      showJoyIdPopupStatus(signPopup, "Preparing supply", "LiquidLane is loading the active vault config.");
      setStatus("Loading the active vault config.");
      const supplyVault = await loadVault();
      if (!supplyVault?.configured || !supplyVault.address?.trim()) {
        throw new Error("LiquidLane vault is not configured yet.");
      }

      writeSupplyState({
        status: "running",
        step: "intent",
        title: "Creating supply intent",
        message: "Core is reserving a vault supply intent for this transaction.",
        amount,
        asset,
      });
      showJoyIdPopupStatus(signPopup, "Preparing supply", "LiquidLane is creating your vault supply intent.");
      setStatus("Preparing the vault supply intent.");
      const intent = await request<SupplyIntent>("/vault/supply/intents", {
        method: "POST",
        body: JSON.stringify({ asset, amount }),
      });

      setStatus("Building the CKB vault transaction.");
      const signed = await supplyVaultLiquidity(activeWallet, {
        vault: supplyVault,
        intent,
        asset,
        amount,
        onProgress(step, message) {
          writeSupplyState({
            status: "running",
            step,
            title: progressTitle[step],
            message,
            amount,
            asset,
          });
          setStatus(message);
        },
      }, signPopup);

      const explorerUrl = transactionExplorerUrl(signed.txHash);
      writeSupplyState({
        status: "running",
        step: "settlement",
        title: "Recording LP receipt",
        message: "CKB RPC accepted the transaction. Core is linking it to your vault position.",
        amount,
        asset,
        txHash: signed.txHash,
        explorerUrl,
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
      formElement.reset();
      writeSupplyState({
        status: "success",
        step: "settlement",
        title: "Supply submitted",
        message: `${assetAmount(amount, asset)} was broadcast to CKB testnet and attached to your LiquidLane LP receipt.`,
        amount,
        asset,
        txHash: signed.txHash,
        explorerUrl,
      });
      setStatus(`Supplied ${assetAmount(amount, asset)} to ${shortAddress(intent.vault_address)} (${shortHash(signed.txHash)}).`);
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Supply failed.";
      showJoyIdPopupStatus(signPopup, "Supply failed", message);
      writeSupplyState({
        status: "failed",
        step: currentStep,
        title: "Supply did not broadcast",
        message: "No CKB was moved unless this panel shows a transaction hash.",
        amount: safeAmount,
        asset,
        error: message,
        diagnostics: errorDiagnostics(error),
      });
      setStatus(message);
    } finally {
      setBusy(null);
    }
  }

  async function handleRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const amount = Number(form.get("amount"));
    const durationDays = Number(form.get("duration_days"));
    const asset = String(form.get("asset") ?? DEFAULT_ASSET).trim().toUpperCase();
    const safeAmount = Number.isFinite(amount) ? amount : undefined;
    const fiberPeerPubkey = blankToUndefined(form.get("fiber_peer_pubkey"));
    const fiberPeerAddress = blankToUndefined(form.get("fiber_peer_address"));
    const payload = {
      asset,
      amount,
      duration_days: durationDays,
      fiber_peer_pubkey: fiberPeerPubkey,
      fiber_peer_address: fiberPeerAddress,
    };
    const progressTitle: Record<RequestProgressStep, string> = {
      vault: "Checking vault",
      funding: "Selecting wallet cells",
      signing: "Waiting for JoyID",
      verify: "Dry-running request",
      broadcast: "Broadcasting request",
    };

    setBusy("request");
    writeActionTx({
      status: "running",
      action: "request",
      title: "Preparing capacity request",
      message: "Validating the request and checking the active vault.",
      amount: safeAmount,
      asset,
    });
    let signPopup: JoyIdPopup | undefined;
    try {
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Requested capacity must be greater than zero.");
      }
      if (!Number.isFinite(durationDays) || durationDays <= 0) {
        throw new Error("Request duration must be greater than zero.");
      }
      if (!isFiberPubkey(fiberPeerPubkey)) {
        throw new Error("Enter the receiving Fiber node pubkey: a compressed 33-byte hex key starting with 02 or 03.");
      }
      if (looksLikeCkbAddress(fiberPeerAddress)) {
        throw new Error("Fiber node address is not a CKB wallet address. Leave it blank, or enter a multiaddr like /ip4/203.0.113.10/tcp/8228/p2p/12D3...");
      }
      if (fiberPeerAddress && !isFiberMultiaddr(fiberPeerAddress)) {
        throw new Error("Fiber node address must be a multiaddr ending in /p2p/<peer_id>, for example /ip4/203.0.113.10/tcp/8228/p2p/12D3...");
      }
      if (!activeVault?.configured || !activeVault.address?.trim()) {
        throw new Error("LiquidLane vault is not configured yet.");
      }

      let activeWallet = wallet;
      if (!activeWallet) {
        const popup = openJoyIdPopup();
        if (!popup) {
          throw new Error("Browser blocked the JoyID popup. Enable popups for localhost and try again.");
        }
        writeActionTx({
          status: "running",
          action: "request",
          title: "Reconnect signer",
          message: "JoyID needs to reconnect before LiquidLane can sign the request cell.",
          amount,
          asset,
        });
        setStatus("Opening JoyID to reconnect your signer.");
        activeWallet = await connectCkbWallet(popup);
        if (dashboard?.user.ckb_address && activeWallet.ckbAddress !== dashboard.user.ckb_address) {
          throw new Error("Connected wallet does not match this LiquidLane session.");
        }
        setWallet(activeWallet);
        setCkbAddress(activeWallet.ckbAddress);
        persistWalletSession(activeWallet);
        writeActionTx({
          status: "ready",
          action: "request",
          title: "Signer reconnected",
          message: "Click Quote + reserve again to sign and broadcast the request cell.",
          amount,
          asset,
        });
        setStatus("JoyID reconnected. Click Request capacity again to sign the request transaction.");
        return;
      }

      signPopup = openJoyIdPopup();
      if (!signPopup) {
        throw new Error("Browser blocked the JoyID popup. Enable popups for localhost and try again.");
      }

      showJoyIdPopupStatus(signPopup, "Preparing request", "LiquidLane is checking live vault liquidity.");
      writeActionTx({
        status: "running",
        action: "request",
        title: "Checking vault liquidity",
        message: "Loading the live vault cell and available CKB capacity.",
        amount,
        asset,
      });
      setStatus("Checking live vault liquidity.");
      const requestVault = await loadVault();
      if (!requestVault?.configured || !requestVault.address?.trim()) {
        throw new Error("LiquidLane vault is not configured yet.");
      }

      const quoteData = await request<LiquidityQuote>("/liquidity/quote", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setQuote(quoteData);
      if (!quoteData.available) {
        const message = `Only ${assetAmount(quoteData.available_liquidity, quoteData.asset)} is available.`;
        setStatus(message);
        writeActionTx({
          status: "failed",
          action: "request",
          title: "Capacity unavailable",
          message,
          amount,
          asset,
          error: "Supply more vault liquidity or request a smaller amount.",
        });
        showJoyIdPopupStatus(signPopup, "Request unavailable", "The vault does not have enough available capacity.");
        return;
      }

      showJoyIdPopupStatus(signPopup, "Preparing request", "Core is creating your capacity request intent.");
      writeActionTx({
        status: "running",
        action: "request",
        title: "Creating request intent",
        message: "Core is preparing the request cell and lease-fee movement.",
        amount,
        asset,
      });
      setStatus("Creating the capacity request intent.");
      const intent = await request<RequestIntent>("/liquidity/request/intents", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const signed = await reserveVaultCapacity(activeWallet, {
        vault: requestVault,
        intent,
        asset,
        amount,
        onProgress(step, message) {
          writeActionTx({
            status: "running",
            action: "request",
            title: progressTitle[step],
            message,
            amount,
            asset,
          });
          setStatus(`${progressTitle[step]}: ${message}`);
        },
      }, signPopup);

      const explorerUrl = transactionExplorerUrl(signed.txHash);
      writeActionTx({
        status: "running",
        action: "request",
        title: "Recording request cell",
        message: "CKB RPC accepted the transaction. Core is verifying the request cell.",
        amount,
        asset,
        txHash: signed.txHash,
        explorerUrl,
      });
      showJoyIdPopupStatus(signPopup, "Recording request", "Core is verifying the request cell transaction.");
      const created = await request<LiquidityRequest>("/liquidity/requests", {
        method: "POST",
        body: JSON.stringify({
          ...payload,
          intent_id: intent.id,
          request_tx_hash: signed.txHash,
          request_cell_out_point: signed.requestCellOutPoint,
          signed_tx: signed.tx,
        }),
      });
      formElement.reset();
      const fiberRef = created.channel_id ?? created.fiber_temporary_channel_id;
      writeActionTx({
        status: "success",
        action: "request",
        title: "Capacity reserved",
        message: requestSuccessMessage(created, amount, asset),
        amount,
        asset,
        txHash: signed.txHash,
        explorerUrl,
        details: [
          { label: "Request status", value: statusLabel(created.status) },
          ...(fiberRef ? [{ label: created.channel_id ? "Channel ID" : "Fiber handoff ref", value: fiberRef }] : []),
        ],
      });
      setStatus(requestSuccessMessage(created, amount, asset));
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Capacity request failed.";
      const isInputError = !signPopup && (
        message.startsWith("Enter the receiving Fiber node pubkey") ||
        message.startsWith("Fiber node address") ||
        message.startsWith("Requested capacity") ||
        message.startsWith("Request duration")
      );
      showJoyIdPopupStatus(signPopup, "Request failed", message);
      writeActionTx({
        status: "failed",
        action: "request",
        title: isInputError ? "Check Fiber request details" : "Capacity request did not broadcast",
        message: isInputError ? "Nothing was sent. Use a Fiber pubkey and optional multiaddr, then reserve capacity again." : "No request cell was accepted unless this panel shows a transaction hash.",
        amount: safeAmount,
        asset,
        error: message,
      });
      setStatus(message);
    } finally {
      setBusy(null);
    }
  }


  async function activeSigningWallet(action: string, popup?: JoyIdPopup) {
    let activeWallet = wallet;
    if (!activeWallet) {
      const connectPopup = popup ?? openJoyIdPopup();
      if (!connectPopup) throw new Error("Browser blocked the JoyID popup. Enable popups for localhost and try again.");
      setStatus(`Opening JoyID to reconnect your signer for ${action}.`);
      activeWallet = await connectCkbWallet(connectPopup);
      if (dashboard?.user.ckb_address && activeWallet.ckbAddress !== dashboard.user.ckb_address) {
        throw new Error("Connected wallet does not match this LiquidLane session.");
      }
      setWallet(activeWallet);
      setCkbAddress(activeWallet.ckbAddress);
      persistWalletSession(activeWallet);
    }
    return activeWallet;
  }

  async function withdrawPosition(positionId: string, requestedAmount?: number) {
    if (!dashboard) return setStatus("LiquidLane dashboard is still syncing.");
    const position = dashboard.positions.find((item) => item.id === positionId);
    if (!position) return setStatus("LP position was not found.");
    if (position.available_amount <= 0) return setStatus("This LP position has no available liquidity to withdraw.");
    const amount = requestedAmount ?? position.available_amount;
    if (!Number.isFinite(amount) || amount <= 0) return setStatus("Enter a valid withdrawal amount.");
    if (amount > position.available_amount) return setStatus(`Only ${assetAmount(position.available_amount, position.asset)} is available from the selected receipt.`);
    const asset = position.asset;
    setBusy(`withdraw-${positionId}`);
    writeActionTx({
      status: "running",
      action: "withdraw",
      title: "Preparing withdrawal",
      message: "Core is creating a withdrawal intent for the requested vault amount.",
      amount,
      asset,
    });
    let popup: JoyIdPopup | undefined;
    try {
      popup = openJoyIdPopup();
      if (!popup) throw new Error("Browser blocked the JoyID popup. Enable popups for localhost and try again.");
      const activeWallet = await activeSigningWallet("withdrawal", popup);
      const vault = await loadVault();
      if (!vault?.configured || !vault.address?.trim()) throw new Error("LiquidLane vault is not configured yet.");
      showJoyIdPopupStatus(popup, "Preparing withdrawal", "Core is creating your withdrawal intent.");
      const intent = await request<WithdrawalIntent>("/vault/withdrawals/intents", {
        method: "POST",
        body: JSON.stringify({ position_id: position.id, amount }),
      });
      const signed = await withdrawVaultLiquidity(activeWallet, {
        vault,
        position,
        intent,
        amount: intent.amount,
        onProgress(step: SettlementProgressStep, message: string) {
          writeActionTx({
            status: "running",
            action: "withdraw",
            title: settlementStepLabel(step),
            message,
            amount,
            asset,
          });
          setStatus(`${settlementStepLabel(step)}: ${message}`);
        },
      }, popup);
      const explorerUrl = transactionExplorerUrl(signed.txHash);
      writeActionTx({
        status: "running",
        action: "withdraw",
        title: "Recording withdrawal",
        message: "CKB RPC accepted the transaction. Core is verifying the receipt settlement.",
        amount,
        asset,
        txHash: signed.txHash,
        explorerUrl,
      });
      await request<WithdrawalIntent>(`/vault/withdrawals/${intent.id}/settle`, {
        method: "POST",
        body: JSON.stringify({
          tx_hash: signed.txHash,
          receipt_cell_out_point: signed.receiptCellOutPoint,
          signed_tx: signed.tx,
        }),
      });
      const vaultBeforeWithdrawal = dashboard.vault;
      writeActionTx({
        status: "success",
        action: "withdraw",
        title: "Withdrawal confirmed",
        message: `${assetAmount(amount, asset)} was returned to your wallet and the vault position was refreshed.`,
        amount,
        asset,
        txHash: signed.txHash,
        explorerUrl,
      });
      await refresh(token);
      applyWithdrawalSnapshot(position, vaultBeforeWithdrawal, amount, signed.txHash);
      setStatus(`Withdrawal broadcast ${shortHash(signed.txHash)} and settled in Core.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Withdrawal failed.";
      showJoyIdPopupStatus(popup, "Withdrawal failed", message);
      writeActionTx({
        status: "failed",
        action: "withdraw",
        title: "Withdrawal did not broadcast",
        message: "No withdrawal was accepted unless this panel shows a transaction hash.",
        amount,
        asset,
        error: message,
      });
      setStatus(message);
    } finally {
      setBusy(null);
    }
  }

  async function claimFees(positionId: string) {
    const position = dashboard?.positions.find((item) => item.id === positionId);
    if (!position) return setStatus("LP position was not found.");
    const amount = Math.max(position.fees_earned - position.fees_claimed, 0);
    const asset = position.asset;
    if (amount <= 0) return setStatus("This LP position has no claimable fees.");
    setBusy(`claim-${positionId}`);
    writeActionTx({
      status: "running",
      action: "claim",
      title: "Preparing fee claim",
      message: "Core is creating a claim intent for earned LP fees.",
      amount,
      asset,
    });
    let popup: JoyIdPopup | undefined;
    try {
      popup = openJoyIdPopup();
      if (!popup) throw new Error("Browser blocked the JoyID popup. Enable popups for localhost and try again.");
      const activeWallet = await activeSigningWallet("fee claim", popup);
      const vault = await loadVault();
      if (!vault?.configured || !vault.address?.trim()) throw new Error("LiquidLane vault is not configured yet.");
      showJoyIdPopupStatus(popup, "Preparing fee claim", "Core is creating your fee claim intent.");
      const claim = await request<FeeClaim>("/vault/fees/claims", {
        method: "POST",
        body: JSON.stringify({ position_id: position.id, amount }),
      });
      const signed = await claimVaultFees(activeWallet, {
        vault,
        position,
        claim,
        amount: claim.amount,
        onProgress(step: SettlementProgressStep, message: string) {
          writeActionTx({
            status: "running",
            action: "claim",
            title: settlementStepLabel(step),
            message,
            amount,
            asset,
          });
          setStatus(`${settlementStepLabel(step)}: ${message}`);
        },
      }, popup);
      const explorerUrl = transactionExplorerUrl(signed.txHash);
      writeActionTx({
        status: "running",
        action: "claim",
        title: "Recording fee claim",
        message: "CKB RPC accepted the transaction. Core is verifying the fee-claim cell.",
        amount,
        asset,
        txHash: signed.txHash,
        explorerUrl,
      });
      await request<FeeClaim>(`/vault/fees/claims/${claim.id}/settle`, {
        method: "POST",
        body: JSON.stringify({
          tx_hash: signed.txHash,
          receipt_cell_out_point: signed.receiptCellOutPoint,
          signed_tx: signed.tx,
        }),
      });
      writeActionTx({
        status: "success",
        action: "claim",
        title: "Fee claim submitted",
        message: `${assetAmount(amount, asset)} in earned fees was broadcast and settled in Core.`,
        amount,
        asset,
        txHash: signed.txHash,
        explorerUrl,
      });
      setStatus(`Fee claim broadcast ${shortHash(signed.txHash)} and settled in Core.`);
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Fee claim failed.";
      showJoyIdPopupStatus(popup, "Fee claim failed", message);
      writeActionTx({
        status: "failed",
        action: "claim",
        title: "Fee claim did not broadcast",
        message: "No claim was accepted unless this panel shows a transaction hash.",
        amount,
        asset,
        error: message,
      });
      setStatus(message);
    } finally {
      setBusy(null);
    }
  }



  const vault = dashboard?.vault ?? activeVault;
  const vaultSummary = dashboard?.vault;
  const hasActiveWallet = Boolean(wallet);
  const hasSavedAddress = Boolean(ckbAddress);
  const hasCoreSession = Boolean(dashboard || token);
  const hasReadySession = Boolean(hasActiveWallet || hasCoreSession);
  const canBrowseServices = hasReadySession;
  const needsWalletReconnect = Boolean(hasSavedAddress && !hasReadySession);
  const heroActionLabel = canBrowseServices ? "Choose service" : needsWalletReconnect ? "Reconnect wallet" : "Connect wallet";
  const utilization = useMemo(() => {
    if (!vaultSummary || vaultSummary.total_deposits === 0) return 0;
    const used = vaultSummary.reserved_liquidity + vaultSummary.deployed_liquidity;
    return Math.round((used / vaultSummary.total_deposits) * 100);
  }, [vaultSummary]);
  const vaultReady = Boolean(vault?.configured && vault.address);
  const claimableFees = dashboard?.positions.reduce((total, position) => total + Math.max(position.fees_earned - position.fees_claimed, 0), 0) ?? 0;

  if (Boolean(dashboard) && surface === "console") {
    const activeDashboard = dashboard as Dashboard;
    return (
      <ConsoleApp
        dashboard={activeDashboard}
        activeView={activeView}
        ckbAddress={ckbAddress}
        walletReady={hasReadySession}
        loading={loading}
        busy={busy}
        status={status}
        copiedWalletAddress={copiedWalletAddress}
        quote={quote}
        fiberRpcConfigured={fiberRpcConfigured}
        coreHealth={coreHealth}
        supplyTx={supplyTx}
        actionTx={actionTx}
        vaultReady={vaultReady}
        utilization={utilization}
        claimableFees={claimableFees}
        onHome={openLandingPage}
        onViewChange={(view) => {
          if (view === "vault") {
            openConsoleView("vault");
            return;
          }
          void enterService(view);
        }}
        onConnectWallet={connectWallet}
        onCopyWalletAddress={copyWalletAddress}
        onSignOut={signOut}
        onRefresh={() => refresh()}
        onDeposit={handleDeposit}
        onRequest={handleRequest}
        onWithdrawPosition={withdrawPosition}
        onClaimFees={claimFees}
      />
    );
  }

  return (
    <main className="app-shell">
      <section className="landing-hero">
        <nav className="topbar landing-topbar" aria-label="Primary navigation">
          <div className="brand">
            <span className="brand-mark"><Droplet size={22} /></span>
            <span>LiquidLane</span>
          </div>
          <div className="landing-nav-links">
            <a className="active" href="#services">Services</a>
          </div>
          <div className="nav-actions">
            {ckbAddress ? (
              <span className="connected-pill" data-state={hasReadySession ? "active" : "restored"}>
                <UserRound size={15} />
                <span>{shortAddress(ckbAddress)}</span>
                <small>{hasReadySession ? "Ready" : "Reconnect"}</small>
                <button
                  type="button"
                  className="copy-address-button"
                  aria-label="Copy wallet address"
                  title="Copy wallet address"
                  onClick={() => copyWalletAddress(ckbAddress)}
                >
                  {copiedWalletAddress ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                </button>
              </span>
            ) : null}
            {hasSavedAddress || hasCoreSession ? (
              <div className="wallet-controls">
                {!hasReadySession ? (
                  <button type="button" onClick={connectWallet} disabled={busy === "connect"}>
                    {busy === "connect" ? <Loader2 className="spin" size={16} /> : <UserRound size={16} />} Reconnect
                  </button>
                ) : null}
                <button type="button" className="secondary-button dark" onClick={signOut}><LogOut size={16} /> Disconnect</button>
              </div>
            ) : (
              <button type="button" onClick={connectWallet} disabled={busy === "connect"}>
                {busy === "connect" ? <Loader2 className="spin" size={16} /> : <UserRound size={16} />} Connect wallet
              </button>
            )}
          </div>
        </nav>

        <div className="landing-content">
          <div className="landing-copy">
            <p className="eyebrow">Liquidity markets for CKB</p>
            <h1>The liquidity layer for CKB and Fiber payments.</h1>
            <p className="lede">Supply CKB into LiquidLane vaults, let merchants reserve receive capacity, and earn from the liquidity demand behind Fiber channel opens.</p>
            <p className="yield-badge">Target up to 10x yield on active vault supply.</p>
            <div className="hero-actions">
              <button type="button" onClick={canBrowseServices ? () => document.getElementById("services")?.scrollIntoView({ behavior: "smooth" }) : connectWallet} disabled={busy === "connect"}>
                {busy === "connect" ? <Loader2 className="spin" size={16} /> : <ArrowRight size={16} />} {heroActionLabel}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="service-section" id="services">
        <div className="section-heading">
          <h2>{canBrowseServices ? "Choose your LiquidLane workflow." : needsWalletReconnect ? "Reconnect JoyID to continue with this wallet." : "Connect a CKB wallet to start."}</h2>
          <p className="muted">Select a workflow to supply liquidity, reserve receive capacity, or review your portfolio.</p>
        </div>
        {needsWalletReconnect ? (
          <div className="wallet-reconnect-note">
            <ShieldCheck size={18} />
            <span>Address is restored. Reconnect only when LiquidLane needs JoyID to sign a CKB transaction.</span>
          </div>
        ) : null}
        <div className="service-grid">
          {services.map((service) => {
            const Icon = service.icon;
            const active = selectedRole === service.role;
            const actionLabel = dashboard?.user.role === service.role ? "Current workflow" : hasReadySession ? "Open workflow" : hasSavedAddress ? "Reconnect + open" : "Connect + open";
            return (
              <article className={active ? "service-card active" : "service-card"} key={service.role}>
                <span className="icon"><Icon size={21} /></span>
                <p className="eyebrow">{service.kicker}</p>
                <h3>{service.title}</h3>
                <p>{service.description}</p>
                <button type="button" onClick={() => enterService(service.role)} disabled={busy === service.role}>
                  {busy === service.role ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />} {actionLabel}
                </button>
              </article>
            );
          })}
        </div>
      </section>

      {dashboard ? (
        <section className="lifecycle-band connected-band" id="workspace">
          <div><Landmark size={18} /> {assetAmount(vaultSummary?.available_liquidity ?? 0, vault?.asset ?? DEFAULT_ASSET)} available</div>
          <div><ShieldCheck size={18} /> {assetAmount(claimableFees, vault?.asset ?? DEFAULT_ASSET)} claimable fees</div>
          <div><RadioTower size={18} /> {dashboard.liquidity_requests.length} capacity requests</div>
          <button type="button" className="secondary-button dark" onClick={() => openConsoleView(activeView)}>
            Open dashboard <ArrowRight size={16} />
          </button>
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

function transactionExplorerUrl(txHash: string) {
  return `${EXPLORER_BASE.replace(/\/$/, "")}/transaction/${txHash}`;
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

function shortFiberAddress(address: string) {
  if (address.length <= 34) return address;
  const peer = address.split("/p2p/")[1] ?? address;
  return `/p2p/${peer.slice(0, 10)}...${peer.slice(-8)}`;
}

function serviceLabel(role: Role) {
  return services.find((service) => service.role === role)?.title ?? role;
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function settlementStepLabel(step: SettlementProgressStep) {
  if (step === "vault") return "Checking vault";
  if (step === "receipt") return "Checking LP receipt";
  if (step === "funding") return "Selecting wallet cells";
  if (step === "signing") return "Waiting for JoyID";
  if (step === "verify") return "Dry-running settlement";
  return "Broadcasting settlement";
}

function requestSuccessMessage(request: LiquidityRequest, amount: number, asset: string) {
  const capacity = assetAmount(amount, asset);
  if (request.status === "pending_fiber_channel") return `${capacity} is reserved. LiquidLane submitted the Fiber handoff and is waiting for channel confirmation.`;
  if (request.status === "channel_open") return `${capacity} is reserved and the Fiber channel is confirmed.`;
  if (request.status === "failed") return `${capacity} is reserved on-chain, but the Fiber handoff needs repair: ${request.fiber_error ?? "unknown Fiber error"}`;
  return `${capacity} is reserved on-chain. LiquidLane executor will process the Fiber handoff.`;
}

function isFiberPubkey(pubkey: string | undefined) {
  if (!pubkey) return false;
  const raw = pubkey.startsWith("0x") ? pubkey.slice(2) : pubkey;
  return /^(02|03)[0-9a-fA-F]{64}$/.test(raw);
}

function looksLikeCkbAddress(value: string | undefined) {
  return Boolean(value && /^ck[bt]1[0-9a-z]+$/i.test(value));
}

function isFiberMultiaddr(value: string) {
  return value.length <= 512 && value.startsWith("/") && value.includes("/p2p/") && !/\s/.test(value);
}

function blankToUndefined(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text ? text : undefined;
}
