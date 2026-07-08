"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  Copy,
  Landmark,
  ExternalLink,
  Loader2,
  LogOut,
  RadioTower,
  ReceiptText,
  Route,
  ShieldCheck,
  Sparkles,
  UserRound,
  Waves,
} from "lucide-react";
import { ConsoleApp, type ConsoleView } from "./console";
import { deployCkbScripts, type DeploymentProgressDetail, type DeploymentResult } from "@/lib/ckbDeployment";
import { reserveVaultCapacity, type RequestProgressStep } from "@/lib/ckbRequest";
import { claimVaultFees, withdrawVaultLiquidity, type SettlementProgressStep } from "@/lib/ckbSettlement";
import { probeJoyIdSdkTransfer, probeJoyIdUnlock, supplyVaultLiquidity, type SupplyProgressStep } from "@/lib/ckbSupply";
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

type Service = {
  role: Role;
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
  error?: string;
  updatedAt: string;
};

type SupplyTxUpdate = Omit<SupplyTxState, "updatedAt">;
type ActionTxUpdate = Omit<ActionTxState, "updatedAt">;

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:18080";
const DEFAULT_ASSET = "CKB";
const EXPLORER_BASE = process.env.NEXT_PUBLIC_CKB_EXPLORER_URL ?? "https://pudge.explorer.nervos.org";
const DEPLOYMENT_POPUP_POOL_SIZE = 5;
const TOKEN_KEY = "liquidlane_token";
const ADDRESS_KEY = "liquidlane_ckb_address";
const WALLET_KEY = "liquidlane_joyid_wallet";


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
  const [activeView, setActiveView] = useState<ConsoleView>("lp");
  const [displayName, setDisplayName] = useState("");
  const [status, setStatus] = useState("Connect a CKB wallet to choose a LiquidLane service.");
  const [copiedWalletAddress, setCopiedWalletAddress] = useState(false);
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
        setActiveView(data.user.role);
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
    const restoredWallet = restoreWalletSession();
    const savedAddress = restoredWallet?.ckbAddress ?? window.localStorage.getItem(ADDRESS_KEY)?.trim();
    const savedToken = window.localStorage.getItem(TOKEN_KEY);
    if (restoredWallet) {
      setWallet(restoredWallet);
      setCkbAddress(restoredWallet.ckbAddress);
      setStatus("JoyID wallet restored. LiquidLane is syncing your workspace.");
    } else if (savedAddress) {
      setCkbAddress(savedAddress);
      if (!savedToken) setStatus("Wallet address restored. Reconnect JoyID when a service needs a signature.");
    }
    if (savedToken) {
      setToken(savedToken);
      refresh(savedToken);
    }
  }, [loadVault, refresh]);

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

  async function enterService(role: Role) {
    setSelectedRole(role);
    setActiveView(role);
    if (dashboard?.user.role === role) {
      document.getElementById("workspace")?.scrollIntoView({ behavior: "smooth" });
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
    clearWalletSession();
    setToken(null);
    setWallet(null);
    setCkbAddress(null);
    setDashboard(null);
    setQuote(null);
    setDeployment(null);
    setDeploymentNotice(null);
    setSupplyTx(null);
    setActionTx(null);
    setCopiedWalletAddress(false);
    setSelectedRole(null);
    setActiveView("lp");
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


  async function runJoyIdProbe() {
    if (!wallet) {
      setStatus("Reconnect JoyID before running the unlock probe.");
      patchSupplyTx({
        probeStatus: "failed",
        probeMessage: "Reconnect JoyID before running the unlock probe.",
      });
      return;
    }

    setBusy("joyid-probe");
    patchSupplyTx({
      probeStatus: "running",
      probeMessage: "Waiting for JoyID to sign a dry-run-only self-change transaction.",
      probeDiagnostics: undefined,
    });
    let popup: JoyIdPopup | undefined;
    try {
      popup = openJoyIdPopup();
      if (!popup) throw new Error("Browser blocked the JoyID popup. Enable popups for localhost and try again.");
      const result = await probeJoyIdUnlock(wallet, popup);
      patchSupplyTx({
        probeStatus: "success",
        probeMessage: `JoyID unlock probe passed on ${shortId(result.fundingOutPoint)}. The remaining issue is specific to the LiquidLane vault transaction shape.`,
        probeDiagnostics: result.diagnostics,
      });
      setStatus("JoyID unlock probe passed. The funding cell can be unlocked in a minimal dry-run transaction.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "JoyID unlock probe failed.";
      patchSupplyTx({
        probeStatus: "failed",
        probeMessage: message,
        probeDiagnostics: errorDiagnostics(error),
      });
      setStatus(message);
    } finally {
      setBusy(null);
    }
  }

  async function runJoyIdSdkProbe() {
    if (!wallet) {
      setStatus("Reconnect JoyID before running the SDK transfer probe.");
      patchSupplyTx({
        probeStatus: "failed",
        probeMessage: "Reconnect JoyID before running the SDK transfer probe.",
      });
      return;
    }

    const recipientAddress = activeVault?.address ?? dashboard?.vault.address;
    if (!recipientAddress?.trim()) {
      setStatus("Active vault address is required for the SDK transfer probe.");
      patchSupplyTx({
        probeStatus: "failed",
        probeMessage: "Active vault address is required for the SDK transfer probe.",
      });
      return;
    }

    setBusy("joyid-sdk-probe");
    patchSupplyTx({
      probeStatus: "running",
      probeMessage: "Waiting for JoyID to build and sign a dry-run-only transfer to the active vault address.",
      probeDiagnostics: undefined,
    });
    let popup: JoyIdPopup | undefined;
    try {
      popup = openJoyIdPopup();
      if (!popup) throw new Error("Browser blocked the JoyID popup. Enable popups for localhost and try again.");
      const result = await probeJoyIdSdkTransfer(wallet, recipientAddress, popup);
      patchSupplyTx({
        probeStatus: "success",
        probeMessage: "JoyID SDK transfer probe passed. LiquidLane raw transaction signing is the remaining area to repair.",
        probeDiagnostics: result.diagnostics,
      });
      setStatus("JoyID SDK transfer probe passed. The next repair should mirror JoyID's signed transaction shape.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "JoyID SDK transfer probe failed.";
      patchSupplyTx({
        probeStatus: "failed",
        probeMessage: message,
        probeDiagnostics: errorDiagnostics(error),
      });
      setStatus(message);
    } finally {
      setBusy(null);
    }
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
    const payload = {
      asset,
      amount,
      duration_days: durationDays,
      fiber_peer_pubkey: blankToUndefined(form.get("fiber_peer_pubkey")),
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
      await request<LiquidityRequest>("/liquidity/requests", {
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
      writeActionTx({
        status: "success",
        action: "request",
        title: "Capacity request submitted",
        message: `${assetAmount(amount, asset)} was reserved and the request cell is now tracked by Core.`,
        amount,
        asset,
        txHash: signed.txHash,
        explorerUrl,
      });
      setStatus(`Capacity request broadcast ${shortHash(signed.txHash)} and reserved on LiquidLane.`);
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Capacity request failed.";
      showJoyIdPopupStatus(signPopup, "Request failed", message);
      writeActionTx({
        status: "failed",
        action: "request",
        title: "Capacity request did not broadcast",
        message: "No request cell was accepted unless this panel shows a transaction hash.",
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

  async function withdrawPosition(positionId: string) {
    const position = dashboard?.positions.find((item) => item.id === positionId);
    if (!position) return setStatus("LP position was not found.");
    if (position.available_amount <= 0) return setStatus("This LP position has no available liquidity to withdraw.");
    const amount = position.available_amount;
    const asset = position.asset;
    setBusy(`withdraw-${positionId}`);
    writeActionTx({
      status: "running",
      action: "withdraw",
      title: "Preparing withdrawal",
      message: "Core is creating a withdrawal intent for the available LP receipt balance.",
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
      writeActionTx({
        status: "success",
        action: "withdraw",
        title: "Withdrawal submitted",
        message: `${assetAmount(amount, asset)} was broadcast back to your wallet and settled in Core.`,
        amount,
        asset,
        txHash: signed.txHash,
        explorerUrl,
      });
      setStatus(`Withdrawal broadcast ${shortHash(signed.txHash)} and settled in Core.`);
      await refresh();
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

  async function openFiberChannel(id: string) {
    const requestItem = dashboard?.liquidity_requests.find((item) => item.id === id);
    setBusy(id);
    writeActionTx({
      status: "running",
      action: "fiber",
      title: "Opening Fiber channel",
      message: "Core is submitting the reserved request to the configured Fiber RPC endpoint.",
      amount: requestItem?.amount,
      asset: requestItem?.asset ?? DEFAULT_ASSET,
    });
    try {
      const updated = await request<LiquidityRequest>(`/liquidity/requests/${id}/deploy`, { method: "POST" });
      const message = statusMessage(updated);
      writeActionTx({
        status: "success",
        action: "fiber",
        title: updated.status === "channel_open" ? "Fiber channel opened" : "Fiber handoff recorded",
        message,
        amount: updated.amount,
        asset: updated.asset,
      });
      setStatus(message);
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Fiber channel open failed.";
      writeActionTx({
        status: "failed",
        action: "fiber",
        title: "Fiber channel open failed",
        message: "Core did not open the channel. Check Fiber RPC configuration and the peer pubkey.",
        amount: requestItem?.amount,
        asset: requestItem?.asset ?? DEFAULT_ASSET,
        error: message,
      });
      setStatus(message);
    } finally {
      setBusy(null);
    }
  }

  async function deployScriptsToTestnet() {
    setBusy("deploy-scripts");
    setDeploymentNotice("Opening JoyID and preparing deployment.");
    const popupPool = openJoyIdPopupPool(DEPLOYMENT_POPUP_POOL_SIZE);
    const popup = firstOpenPopup(popupPool);
    if (!popup) {
      closeJoyIdPopupPool(popupPool);
      setBusy(null);
      setDeploymentNotice("Browser blocked the JoyID popup. Enable popups for localhost and try again.");
      setStatus("Browser blocked the JoyID popup. Enable popups for localhost and try again.");
      return;
    }
    try {
      let activeWallet = wallet;
      if (!activeWallet) {
        setStatus("Opening JoyID to reconnect your signer.");
        activeWallet = await connectCkbWallet(popup);
        if (dashboard?.user.ckb_address && activeWallet.ckbAddress !== dashboard.user.ckb_address) {
          throw new Error("Connected wallet does not match this LiquidLane session.");
        }
        setWallet(activeWallet);
        setCkbAddress(activeWallet.ckbAddress);
        persistWalletSession(activeWallet);
        setDeploymentNotice("JoyID reconnected. Click Deploy to testnet again to sign the deployment transaction.");
        setStatus("JoyID reconnected. Click Deploy to testnet again to sign the deployment transaction.");
        return;
      }

      setStatus("Preparing CKB script deployment package.");
      const result = await deployCkbScripts(API_BASE, activeWallet, {
        popup,
        popups: popupPool,
        onProgress(step, detail) {
          const message = deploymentStepMessage(step, detail);
          setDeploymentNotice(message);
          setStatus(message);
        },
      });
      setDeployment(result);
      const transactionLabel = result.transactions.length === 1 ? shortHash(result.txHash) : `${result.transactions.length} deployment transactions`;
      setDeploymentNotice(`Deployment broadcast ${transactionLabel}. Track it on CKB testnet explorer.`);
      setStatus(`Deployment broadcast ${transactionLabel}. Track it on CKB testnet explorer.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "CKB script deployment failed.";
      setDeploymentNotice(message);
      setStatus(message);
    } finally {
      closeJoyIdPopupPool(popupPool);
      setBusy(null);
    }
  }

  const vault = dashboard?.vault ?? activeVault;
  const vaultSummary = dashboard?.vault;
  const hasActiveWallet = Boolean(wallet);
  const hasSavedAddress = Boolean(ckbAddress);
  const hasCoreSession = Boolean(dashboard || token);
  const canBrowseServices = Boolean(hasActiveWallet || hasCoreSession);
  const needsWalletReconnect = Boolean(hasSavedAddress && !hasActiveWallet);
  const heroActionLabel = canBrowseServices ? "Choose service" : needsWalletReconnect ? "Reconnect wallet" : "Connect wallet";
  const utilization = useMemo(() => {
    if (!vaultSummary || vaultSummary.total_deposits === 0) return 0;
    const used = vaultSummary.reserved_liquidity + vaultSummary.pending_channel_liquidity + vaultSummary.deployed_liquidity;
    return Math.round((used / vaultSummary.total_deposits) * 100);
  }, [vaultSummary]);
  const showSupply = dashboard?.user.role === "lp" || dashboard?.user.role === "operator";
  const showRequest = dashboard?.user.role === "merchant" || dashboard?.user.role === "operator";
  const vaultReady = Boolean(vault?.configured && vault.address);
  const claimableFees = dashboard?.positions.reduce((total, position) => total + Math.max(position.fees_earned - position.fees_claimed, 0), 0) ?? 0;

  if (Boolean(dashboard)) {
    const activeDashboard = dashboard as Dashboard;
    return (
      <ConsoleApp
        dashboard={activeDashboard}
        activeView={activeView}
        ckbAddress={ckbAddress}
        walletReady={hasActiveWallet}
        loading={loading}
        busy={busy}
        status={status}
        copiedWalletAddress={copiedWalletAddress}
        quote={quote}
        supplyTx={supplyTx}
        actionTx={actionTx}
        vaultReady={vaultReady}
        utilization={utilization}
        claimableFees={claimableFees}
        onViewChange={(view) => {
          if (view === "vault") {
            setActiveView("vault");
            return;
          }
          void enterService(view);
        }}
        onConnectWallet={connectWallet}
        onCopyWalletAddress={copyWalletAddress}
        onSignOut={signOut}
        onRefresh={() => refresh()}
        onDeposit={handleDeposit}
        onProbeJoyIdUnlock={runJoyIdProbe}
        onProbeJoyIdSdkTransfer={runJoyIdSdkProbe}
        onRequest={handleRequest}
        onOpenFiberChannel={openFiberChannel}
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
            <span className="brand-mark"><Waves size={18} /></span>
            <span>LiquidLane</span>
          </div>
          <div className="nav-actions">
            {dashboard ? <a href="#workspace">Workspace</a> : <a href="#services">Services</a>}
            <a href="#lifecycle">Lifecycle</a>
            {ckbAddress ? (
              <span className="connected-pill" data-state={hasActiveWallet ? "active" : "restored"}>
                <UserRound size={15} />
                <span>{shortAddress(ckbAddress)}</span>
                <small>{hasActiveWallet ? "Ready" : "Reconnect"}</small>
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
                {!hasActiveWallet ? (
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
            <p className="eyebrow">Fiber liquidity infrastructure</p>
            <h1>Stablecoin capacity for payment channels, ready when apps need it.</h1>
            <p className="lede">LiquidLane gives LPs, merchants, and node operators one CKB-native lane for vault liquidity, receive capacity, and Fiber channel opens.</p>
            <div className="hero-actions">
              <button type="button" onClick={canBrowseServices ? () => document.getElementById("services")?.scrollIntoView({ behavior: "smooth" }) : connectWallet} disabled={busy === "connect"}>
                {busy === "connect" ? <Loader2 className="spin" size={16} /> : <ArrowRight size={16} />} {heroActionLabel}
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
          <h2>{canBrowseServices ? "What do you want to do on LiquidLane?" : needsWalletReconnect ? "Reconnect JoyID to continue with this wallet." : "Connect once, then choose the lane you need."}</h2>
          <p className="muted">{status}</p>
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
            const actionLabel = dashboard?.user.role === service.role ? "Current service" : hasActiveWallet ? "Open service" : hasSavedAddress ? "Reconnect + open" : "Connect + open";
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
                  {busy === service.role ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />} {actionLabel}
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
              <article className="supply-card">
                <span className="icon"><CircleDollarSign size={20} /></span>
                <h2>Supply liquidity</h2>
                <form className="stack-form" onSubmit={handleDeposit}>
                  <label>Asset<input name="asset" value={vault?.asset ?? DEFAULT_ASSET} readOnly required /></label>
                  <label>Amount<input name="amount" type="number" min="1" step="1" placeholder="100" required /></label>
                  <button type="submit" disabled={busy === "deposit" || !vaultReady}>{busy === "deposit" ? <Loader2 className="spin" size={16} /> : <Banknote size={16} />} {busy === "deposit" ? "Processing supply" : "Confirm supply"}</button>
                </form>
                {vaultReady && vault?.address ? <p className="muted compact-note">Active vault <code>{shortAddress(vault.address)}</code></p> : null}
                {!vaultReady ? <p className="muted compact-note">Vault setup is pending on Core.</p> : null}
                <SupplyTransactionPanel state={supplyTx} onProbeJoyIdUnlock={runJoyIdProbe} onProbeJoyIdSdkTransfer={runJoyIdSdkProbe} probeBusy={busy === "joyid-probe" || busy === "joyid-sdk-probe"} />
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
                      <TxMiniLink txHash={position.supply_tx_hash} label="Supply tx" />
                      <button type="button" className="ghost-button small" onClick={() => withdrawPosition(position.id)} disabled={busy === `withdraw-${position.id}` || position.available_amount <= 0}>
                        {busy === `withdraw-${position.id}` ? <Loader2 className="spin" size={14} /> : <ArrowRight size={14} />} Withdraw
                      </button>
                      <button type="button" className="ghost-button small" onClick={() => claimFees(position.id)} disabled={busy === `claim-${position.id}` || Math.max(position.fees_earned - position.fees_claimed, 0) <= 0}>
                        {busy === `claim-${position.id}` ? <Loader2 className="spin" size={14} /> : <Banknote size={14} />} Claim
                      </button>
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
                          {withdrawal.tx_hash ? <TxMiniLink txHash={withdrawal.tx_hash} label="Withdraw tx" /> : null}
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
                          {claim.tx_hash ? <TxMiniLink txHash={claim.tx_hash} label="Claim tx" /> : null}
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
                      <code>{shortId(request.request_cell_id)}</code>
                      {request.request_tx_hash ? <TxMiniLink txHash={request.request_tx_hash} label="Request tx" /> : null}
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
                )) : <EmptyState title="No activity yet" text="Confirmed Core events will appear after vault or Fiber operations settle." />}
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

const supplySteps: { id: SupplyStepId; label: string }[] = [
  { id: "vault", label: "Vault" },
  { id: "intent", label: "Intent" },
  { id: "funding", label: "Cells" },
  { id: "signing", label: "Sign" },
  { id: "verify", label: "Verify" },
  { id: "broadcast", label: "Broadcast" },
  { id: "settlement", label: "Receipt" },
];

function SupplyTransactionPanel({ state, onProbeJoyIdUnlock, onProbeJoyIdSdkTransfer, probeBusy = false }: { state: SupplyTxState | null; onProbeJoyIdUnlock?: () => void; onProbeJoyIdSdkTransfer?: () => void; probeBusy?: boolean }) {
  if (!state) return null;
  const activeIndex = supplySteps.findIndex((step) => step.id === state.step);

  return (
    <div className="supply-transaction" data-status={state.status} role="status" aria-live="polite">
      <div className="supply-transaction-head">
        <span className="tx-state-icon" aria-hidden="true">
          {state.status === "success" || state.status === "ready" ? <CheckCircle2 size={18} /> : state.status === "failed" ? <AlertTriangle size={18} /> : <Loader2 className="spin" size={18} />}
        </span>
        <div>
          <strong>{state.title}</strong>
          <span>{state.message}</span>
        </div>
        <time>{state.updatedAt}</time>
      </div>
      <div className="supply-stepper" aria-label="Supply transaction progress">
        {supplySteps.map((step, index) => {
          const stateName = state.status === "failed" && index === activeIndex ? "failed" : index < activeIndex || state.status === "success" || (state.status === "ready" && index === activeIndex) ? "done" : index === activeIndex ? "active" : "waiting";
          return <span key={step.id} data-state={stateName}>{step.label}</span>;
        })}
      </div>
      {state.amount && state.asset ? (
        <div className="supply-context">
          <span>Amount</span>
          <strong>{assetAmount(state.amount, state.asset)}</strong>
        </div>
      ) : null}
      {state.error ? <p className="supply-error">{state.error}</p> : null}
      {state.diagnostics?.length ? <DiagnosticList title="JoyID transaction diagnostics" items={state.diagnostics} /> : null}
      {state.status === "failed" && (onProbeJoyIdUnlock || onProbeJoyIdSdkTransfer) ? (
        <div className="probe-actions">
          {onProbeJoyIdUnlock ? (
            <button type="button" className="ghost-button small" onClick={onProbeJoyIdUnlock} disabled={probeBusy}>
              {probeBusy ? <Loader2 className="spin" size={14} /> : <ShieldCheck size={14} />} Raw unlock probe
            </button>
          ) : null}
          {onProbeJoyIdSdkTransfer ? (
            <button type="button" className="ghost-button small" onClick={onProbeJoyIdSdkTransfer} disabled={probeBusy}>
              {probeBusy ? <Loader2 className="spin" size={14} /> : <ShieldCheck size={14} />} SDK transfer probe
            </button>
          ) : null}
        </div>
      ) : null}
      {state.probeMessage ? (
        <div className="probe-result" data-status={state.probeStatus ?? "ready"}>
          <strong>{state.probeStatus === "success" ? "Probe passed" : state.probeStatus === "failed" ? "Probe failed" : "Probe running"}</strong>
          <span>{state.probeMessage}</span>
        </div>
      ) : null}
      {state.probeDiagnostics?.length ? <DiagnosticList title="Probe diagnostics" items={state.probeDiagnostics} /> : null}
      {state.txHash ? (
        <TransactionReceipt txHash={state.txHash} explorerUrl={state.explorerUrl} label="Vault supply" success={state.status === "success"} />
      ) : (
        <p className="muted compact-note">No transaction hash has been broadcast yet.</p>
      )}
    </div>
  );
}


function DiagnosticList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="diagnostic-list">
      <strong>{title}</strong>
      {items.map((item) => <code key={item}>{item}</code>)}
    </div>
  );
}

function TransactionReceipt({ txHash, explorerUrl, label, success }: { txHash: string; explorerUrl?: string; label: string; success?: boolean }) {
  const href = explorerUrl ?? transactionExplorerUrl(txHash);
  return (
    <div className="transaction-receipt-card" data-success={success ? "true" : "false"}>
      <div className="receipt-status-row">
        <span><CheckCircle2 size={18} /></span>
        <div>
          <strong>{success ? "Confirmed on CKB testnet" : "Transaction broadcast"}</strong>
          <small>{label}</small>
        </div>
      </div>
      <div className="receipt-hash-row">
        <span>Tx hash</span>
        <code title={txHash}>{txHash}</code>
        <button type="button" aria-label="Copy transaction hash" title="Copy transaction hash" onClick={() => copyText(txHash)}><Copy size={14} /></button>
      </div>
      <a className="receipt-explorer-link" href={href} target="_blank" rel="noreferrer">
        View on testnet explorer <ExternalLink size={14} />
      </a>
    </div>
  );
}

function TxMiniLink({ txHash, label }: { txHash: string; label: string }) {
  return (
    <a className="tx-mini-link" href={transactionExplorerUrl(txHash)} target="_blank" rel="noreferrer" title={txHash}>
      <ExternalLink size={12} /> {label} <code>{shortHash(txHash)}</code>
    </a>
  );
}

function copyText(value: string) {
  void navigator.clipboard?.writeText(value);
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

function shortId(id: string) {
  if (id.length <= 22) return id;
  return `${id.slice(0, 12)}...${id.slice(-8)}`;
}

function openJoyIdPopupPool(size: number): JoyIdPopup[] {
  return Array.from({ length: size }, () => openJoyIdPopup());
}

function firstOpenPopup(popups: JoyIdPopup[]) {
  return popups.find((popup) => popup && !popup.closed) ?? null;
}

function closeJoyIdPopupPool(popups: JoyIdPopup[]) {
  for (const popup of popups) {
    if (popup && !popup.closed) popup.close();
  }
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

function deploymentStepMessage(step: "package" | "funding" | "signing" | "broadcast", detail?: DeploymentProgressDetail) {
  const counter = detail && detail.total > 1 ? ` ${detail.current}/${detail.total}` : "";
  if (step === "package") return "Loading compiled CKB script package from Core.";
  if (step === "funding") return "Planning single-input JoyID deployment transactions.";
  if (step === "signing") return `Confirm CKB script deployment${counter} in JoyID.`;
  return `Broadcasting CKB script deployment${counter} to testnet.`;
}

function settlementStepLabel(step: SettlementProgressStep) {
  if (step === "vault") return "Checking vault";
  if (step === "receipt") return "Checking LP receipt";
  if (step === "funding") return "Selecting wallet cells";
  if (step === "signing") return "Waiting for JoyID";
  if (step === "verify") return "Dry-running settlement";
  return "Broadcasting settlement";
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
