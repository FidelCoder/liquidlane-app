"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  Bell,
  CheckCircle2,
  CircleDollarSign,
  Copy,
  ExternalLink,
  Filter,
  Gauge,
  HelpCircle,
  House,
  KeyRound,
  Landmark,
  Link2,
  Loader2,
  LogOut,
  PlusCircle,
  ReceiptText,
  Route,
  Settings,
  SlidersHorizontal,
  Store,
  TerminalSquare,
  UserRound,
  X,
} from "lucide-react";
import type {
  ActionTxState,
  Dashboard,
  HealthStatus,
  LiquidityQuote,
  LiquidityRequest,
  Role,
  SupplyStepId,
  SupplyTxState,
} from "./page";

export type ConsoleView = Exclude<Role, "operator"> | "vault";

const DEFAULT_ASSET = "CKB";
const EXPLORER_BASE = process.env.NEXT_PUBLIC_CKB_EXPLORER_URL ?? "https://pudge.explorer.nervos.org";

export type ConsoleAppProps = {
  dashboard: Dashboard;
  activeView: ConsoleView;
  ckbAddress: string | null;
  walletReady: boolean;
  loading: boolean;
  busy: string | null;
  status: string;
  copiedWalletAddress: boolean;
  quote: LiquidityQuote | null;
  supplyTx: SupplyTxState | null;
  actionTx: ActionTxState | null;
  vaultReady: boolean;
  fiberRpcConfigured: boolean;
  coreHealth: HealthStatus | null;
  utilization: number;
  claimableFees: number;
  onHome: () => void;
  onViewChange: (view: ConsoleView) => void;
  onConnectWallet: () => void;
  onCopyWalletAddress: (address: string) => void;
  onSignOut: () => void;
  onRefresh: () => void | Promise<void>;
  onDeposit: (event: FormEvent<HTMLFormElement>) => void;
  onRequest: (event: FormEvent<HTMLFormElement>) => void;
  onWithdrawPosition: (id: string, amount?: number) => void;
  onClaimFees: (id: string) => void;
};

const consoleItems: { view: ConsoleView; label: string; detail: string; icon: typeof CircleDollarSign }[] = [
  { view: "lp", label: "Supply Liquidity", detail: "Supply vault capacity", icon: CircleDollarSign },
  { view: "merchant", label: "Request Capacity", detail: "Reserve receive capacity", icon: Store },
  { view: "vault", label: "Portfolio", detail: "Vault and activity", icon: Landmark },
];

export function ConsoleApp(props: ConsoleAppProps) {
  const {
    dashboard,
    activeView,
    ckbAddress,
    walletReady,
    loading,
    busy,
    status,
    copiedWalletAddress,
    quote,
    supplyTx,
    actionTx,
    vaultReady,
    fiberRpcConfigured,
    coreHealth,
    utilization,
    claimableFees,
    onHome,
    onViewChange,
    onConnectWallet,
    onCopyWalletAddress,
    onSignOut,
    onRefresh,
    onDeposit,
    onRequest,
    onWithdrawPosition,
    onClaimFees,
  } = props;
  const vault = dashboard.vault;
  const ckbRpcConfigured = coreHealth?.ckb_rpc_configured ?? false;
  const betaReady = coreHealth?.beta_ready ?? false;
  const executorEnabled = coreHealth?.executor_enabled ?? false;
  const pendingHandoffs = coreHealth?.executor_pending_handoffs ?? 0;
  const fundingMode = coreHealth?.executor_funding_mode ?? "vault_external";
  const vaultExternalMode = fundingMode === "vault_external";
  const externalFundingReady = coreHealth?.external_funding_ready ?? false;
  const externalFundingBlocker = coreHealth?.external_funding_blockers?.[0];
  const fundingModeLabel = vaultExternalMode ? (externalFundingReady ? "Vault external ready" : "Vault funding pending") : "Node diagnostic";
  const title = activeView === "vault" ? "Portfolio" : serviceLabel(activeView);
  const subtitle = activeView === "lp"
    ? "Supply vault capacity and track your LP position."
    : activeView === "merchant"
      ? "Reserve inbound capacity while LiquidLane handles Fiber execution."
      : "Inspect personal vault state, settlements, and activity.";

  return (
    <main className="console-shell">
      <ConsoleRail activeView={activeView} onHome={onHome} onViewChange={onViewChange} />
      <section className="console-main">
        <header className="console-topbar">
          <div className="console-titlebar">
            <TerminalSquare size={22} />
            <div>
              <span>{activeView === "vault" ? "Vault Stats" : "Lane Operations"}</span>
              <strong>{title}</strong>
            </div>
          </div>
          <ConsoleTabs activeView={activeView} onViewChange={onViewChange} />
          <div className="console-actions">
            <a href="https://github.com/FidelCoder/liquidlane-core/blob/main/README.md" target="_blank" rel="noreferrer" aria-label="Open LiquidLane docs"><HelpCircle size={18} /></a>
            <button type="button" aria-label="Sync dashboard" onClick={() => onRefresh()} disabled={loading}>
              {loading ? <Loader2 className="spin" size={18} /> : <Settings size={18} />}
            </button>
            <span className="notification-dot" aria-label="Network status"><Bell size={18} /></span>
            {ckbAddress ? (
              <span className="console-wallet" data-state={walletReady ? "ready" : "restore"}>
                <UserRound size={15} />
                <span>{shortAddress(ckbAddress)}</span>
                <button type="button" aria-label="Copy wallet address" title="Copy wallet address" onClick={() => onCopyWalletAddress(ckbAddress)}>
                  {copiedWalletAddress ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                </button>
              </span>
            ) : null}
            {!walletReady ? (
              <button type="button" className="gold-button" onClick={onConnectWallet} disabled={busy === "connect"}>
                {busy === "connect" ? <Loader2 className="spin" size={16} /> : <KeyRound size={16} />} Reconnect
              </button>
            ) : null}
            <button type="button" className="ghost-button" onClick={onSignOut}><LogOut size={16} /> Disconnect</button>
          </div>
        </header>

        <div className="console-content">
          <section className="console-hero-strip">
            <div>
              <p className="eyebrow">Infrastructure Health</p>
              <h1>{title}</h1>
              <p>{subtitle}</p>
              <div className="console-health-row">
                <span><i /> {vault.network}</span>
                <span>Vault {vault.configured ? "configured" : "pending"}</span>
                <span>CKB RPC {ckbRpcConfigured ? "configured" : "missing"}</span>
                <span>Fiber RPC {fiberRpcConfigured ? "configured" : "missing"}</span>
                <span>Executor {executorEnabled ? "auto" : "paused"}</span>
                <span>Funding {fundingModeLabel}</span>
                {vaultExternalMode && !externalFundingReady && externalFundingBlocker ? <span>{externalFundingBlocker.length > 40 ? `${externalFundingBlocker.slice(0, 40)}...` : externalFundingBlocker}</span> : null}
                {pendingHandoffs ? <span>{pendingHandoffs} funding wait{pendingHandoffs === 1 ? "" : "s"}</span> : null}
                <span>Beta {betaReady ? "ready" : "warming"}</span>
                <span>Synced {new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit" }).format(new Date())}</span>
                <span>{status.length > 48 ? `${status.slice(0, 48)}...` : status}</span>
              </div>
            </div>
            <div className="console-hero-actions">
              <button type="button" className="ghost-button" onClick={() => onRefresh()} disabled={loading}>{loading ? <Loader2 className="spin" size={16} /> : <Gauge size={16} />} Sync</button>
            </div>
          </section>

          {activeView !== "lp" ? <ActionTransactionPanel state={actionTx} /> : null}

          {activeView === "lp" ? (
            <LiquidityProvisionView dashboard={dashboard} utilization={utilization} vaultReady={vaultReady} busy={busy} supplyTx={supplyTx} actionTx={actionTx} claimableFees={claimableFees} onDeposit={onDeposit} onWithdrawPosition={onWithdrawPosition} onClaimFees={onClaimFees} />
          ) : activeView === "merchant" ? (
            <MerchantTerminalView dashboard={dashboard} busy={busy} quote={quote} fiberRpcConfigured={fiberRpcConfigured} fundingMode={fundingMode} onRequest={onRequest} />
          ) : (
            <VaultStatsView dashboard={dashboard} utilization={utilization} claimableFees={claimableFees} busy={busy} onWithdrawPosition={onWithdrawPosition} onClaimFees={onClaimFees} />
          )}
        </div>
      </section>
    </main>
  );
}

function ConsoleRail({ activeView, onHome, onViewChange }: { activeView: ConsoleView; onHome: () => void; onViewChange: (view: ConsoleView) => void }) {
  return (
    <aside className="console-rail" aria-label="LiquidLane quick navigation">
      <button type="button" className="rail-brand" onClick={onHome} aria-label="Back to LiquidLane home" title="Home">
        <House size={22} />
      </button>
      <div className="rail-menu">
        {consoleItems.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.view} type="button" data-active={activeView === item.view} onClick={() => onViewChange(item.view)} aria-label={item.label} title={item.label}>
              <Icon size={20} />
            </button>
          );
        })}
      </div>
      <button type="button" className="rail-control" aria-label="Console settings" title="Console settings">
        <SlidersHorizontal size={20} />
      </button>
    </aside>
  );
}

function ConsoleTabs({ activeView, onViewChange }: { activeView: ConsoleView; onViewChange: (view: ConsoleView) => void }) {
  return (
    <nav className="console-tabs" aria-label="LiquidLane services">
      {consoleItems.map((item) => {
        const Icon = item.icon;
        return (
          <button key={item.view} type="button" data-active={activeView === item.view} onClick={() => onViewChange(item.view)}>
            <Icon size={16} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function LiquidityProvisionView({ dashboard, utilization, vaultReady, busy, supplyTx, actionTx, claimableFees, onDeposit, onWithdrawPosition, onClaimFees }: {
  dashboard: Dashboard;
  utilization: number;
  vaultReady: boolean;
  busy: string | null;
  supplyTx: SupplyTxState | null;
  actionTx: ActionTxState | null;
  claimableFees: number;
  onDeposit: (event: FormEvent<HTMLFormElement>) => void;
  onWithdrawPosition: (id: string, amount?: number) => void;
  onClaimFees: (id: string) => void;
}) {
  const [panelMode, setPanelMode] = useState<"activity" | "reserves">("activity");

  return (
    <div className="lp-workspace">
      <LiquidityVaultCard dashboard={dashboard} utilization={utilization} vaultReady={vaultReady} busy={busy} supplyTx={supplyTx} actionTx={actionTx} claimableFees={claimableFees} onDeposit={onDeposit} onWithdrawPosition={onWithdrawPosition} onClaimFees={onClaimFees} />

      <section className="console-panel lane-default-panel lane-insight-panel">
        <div className="panel-title split-title insight-title">
          <div>
            <h2>{panelMode === "activity" ? "Transaction Activity" : "Active Channel Reserves"}</h2>
            <p>{panelMode === "activity" ? "Supplies, withdrawals, claims, and capacity requests confirmed by Core." : "Reserved liquidity across connected Fiber lanes."}</p>
          </div>
          <div className="panel-switcher" role="tablist" aria-label="Liquidity panel view">
            <button type="button" role="tab" aria-selected={panelMode === "activity"} data-active={panelMode === "activity"} onClick={() => setPanelMode("activity")}>
              <ReceiptText size={15} /> Activity
            </button>
            <button type="button" role="tab" aria-selected={panelMode === "reserves"} data-active={panelMode === "reserves"} onClick={() => setPanelMode("reserves")}>
              <Filter size={15} /> Reserves
            </button>
          </div>
        </div>
        {panelMode === "activity" ? <TransactionActivity dashboard={dashboard} /> : <ReserveTable dashboard={dashboard} />}
      </section>
    </div>
  );
}

function LiquidityVaultCard({ dashboard, utilization, vaultReady, busy, supplyTx, actionTx, claimableFees, onDeposit, onWithdrawPosition, onClaimFees }: {
  dashboard: Dashboard;
  utilization: number;
  vaultReady: boolean;
  busy: string | null;
  supplyTx: SupplyTxState | null;
  actionTx: ActionTxState | null;
  claimableFees: number;
  onDeposit: (event: FormEvent<HTMLFormElement>) => void;
  onWithdrawPosition: (id: string, amount?: number) => void;
  onClaimFees: (id: string) => void;
}) {
  const vault = dashboard.vault;
  const [mode, setMode] = useState<"supply" | "withdraw">("supply");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [dismissedReceiptKey, setDismissedReceiptKey] = useState<string | null>(null);
  const withdrawablePositions = useMemo(
    () => dashboard.positions
      .filter((position) => position.status === "active" && position.available_amount > 0)
      .sort((a, b) => a.available_amount - b.available_amount),
    [dashboard.positions],
  );
  const totalAvailable = withdrawablePositions.reduce((sum, position) => sum + position.available_amount, 0);
  const walletSupplied = dashboard.positions.reduce((sum, position) => sum + position.supplied_amount, 0);
  const walletReserved = dashboard.positions.reduce((sum, position) => sum + position.reserved_amount, 0);
  const largestSingleReceipt = withdrawablePositions.reduce((max, position) => Math.max(max, position.available_amount), 0);
  const claimablePosition = dashboard.positions.find((position) => position.fees_earned > position.fees_claimed);
  const withdrawalRunning = Boolean(busy?.startsWith("withdraw-") || (actionTx?.action === "withdraw" && actionTx.status === "running"));
  const withdrawalSuccess = actionTx?.action === "withdraw" && actionTx.status === "success";
  const settlementAction = actionTx?.action === "withdraw" || actionTx?.action === "claim" ? actionTx : null;
  const supplyReceiptKey = supplyTx?.txHash ? `supply-${supplyTx.txHash}` : null;
  const withdrawReceiptKey = actionTx?.action === "withdraw" && actionTx.txHash ? `withdraw-${actionTx.txHash}` : null;
  const showSupplyReceipt = Boolean(supplyReceiptKey && dismissedReceiptKey !== supplyReceiptKey && supplyTx?.status !== "failed");
  const showWithdrawReceipt = Boolean(withdrawReceiptKey && dismissedReceiptKey !== withdrawReceiptKey && actionTx?.status === "success");
  const supplyHasBroadcast = Boolean(supplyTx?.txHash && supplyTx.status !== "failed");
  const supplySubmitting = busy === "deposit" && !supplyHasBroadcast;

  useEffect(() => {
    if (!withdrawalSuccess) return;
    setMode("withdraw");
    setWithdrawAmount("");
    setFormError(null);
  }, [withdrawalSuccess, actionTx?.txHash]);

  function submitWithdrawal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requestedAmount = Math.trunc(Number(withdrawAmount));
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      setFormError("Enter a valid CKB amount.");
      return;
    }
    const position = withdrawablePositions.find((item) => item.available_amount >= requestedAmount);
    if (!position) {
      setFormError(`Largest single withdrawal available is ${assetAmount(largestSingleReceipt, vault.asset)}.`);
      return;
    }
    setFormError(null);
    onWithdrawPosition(position.id, requestedAmount);
  }

  return (
    <section className="vault-action-card" data-mode={mode}>
      <div className="vault-card-topline">Your Withdrawable Liquidity</div>
      <div className="vault-card-balance">
        <strong>{formatWhole(totalAvailable)}</strong>
        <span>{vault.asset}</span>
      </div>
      <div className="vault-card-divider" />
      <div className="vault-card-metrics">
        <Metric label="Your supplied" value={assetAmount(walletSupplied, vault.asset)} />
        <Metric label="Your reserved" value={assetAmount(walletReserved, vault.asset)} />
        <Metric label="Global available" value={assetAmount(vault.available_liquidity, vault.asset)} />
        <Metric label="Yield accrued" value={assetAmount(vault.fees_earned, vault.asset)} />
      </div>
      <div className="vault-card-divider" />
      <div className="vault-mode-switch" role="tablist" aria-label="Vault action mode">
        <button type="button" data-active={mode === "supply"} onClick={() => setMode("supply")}>
          <PlusCircle size={21} /> Supply
        </button>
        <button type="button" data-active={mode === "withdraw"} onClick={() => setMode("withdraw")}>
          <ArrowDownToLine size={21} /> Withdraw
        </button>
      </div>

      <div className="vault-action-surface">
        {mode === "supply" ? (
          <div className="vault-action-pane">
            {showSupplyReceipt && supplyTx?.txHash ? (
              <VaultSuccessReceiptCard
                title="Supply Confirmed"
                message={supplyTx.status === "success" ? "Your liquidity has been successfully recorded." : "CKB testnet accepted the transaction. Core is refreshing your LP receipt."}
                asset={supplyTx.asset ?? vault.asset}
                amount={supplyTx.amount}
                txHash={supplyTx.txHash}
                explorerUrl={supplyTx.explorerUrl}
                onClose={() => setDismissedReceiptKey(supplyReceiptKey)}
              />
            ) : (
              <>
                <div className="panel-title compact-title">
                  <CircleDollarSign size={20} />
                  <div>
                    <h2>Supply Liquidity</h2>
                    <p>Fund the active CKB vault and record an LP receipt.</p>
                  </div>
                </div>
                <form className="stack-form console-form" onSubmit={onDeposit}>
                  <div className="form-row">
                    <label>Asset<input name="asset" value={vault.asset} readOnly required /></label>
                    <label>Amount ({vault.asset})<input name="amount" type="number" min="1" step="1" placeholder="100" required /></label>
                  </div>
                  <div className="form-meter">
                    <span>Channel utilization after supply</span>
                    <strong>{utilization}%</strong>
                    <div><i style={{ width: `${Math.max(utilization, 4)}%` }} /></div>
                  </div>
                  <button type="submit" className="gold-button" disabled={busy === "deposit" || !vaultReady}>{supplySubmitting ? <Loader2 className="spin" size={16} /> : <Banknote size={16} />} Confirm Supply</button>
                </form>
                {vaultReady && vault.address ? <p className="muted compact-note">Active vault <code>{shortAddress(vault.address)}</code></p> : <p className="muted compact-note">Vault setup is pending on Core.</p>}
                <SupplyTransactionPanel state={supplyTx} />
              </>
            )}
          </div>
        ) : (
          <div className="vault-action-pane">
            {showWithdrawReceipt && actionTx?.txHash ? (
              <VaultSuccessReceiptCard
                title="Withdrawal Confirmed"
                message="Available liquidity was returned to the connected wallet."
                asset={actionTx.asset ?? vault.asset}
                amount={actionTx.amount}
                txHash={actionTx.txHash}
                explorerUrl={actionTx.explorerUrl}
                onClose={() => setDismissedReceiptKey(withdrawReceiptKey)}
              />
            ) : (
              <>
                <div className="panel-title compact-title split-title">
                  <div className="panel-title-inline">
                    <ArrowDownToLine size={20} />
                    <div>
                      <h2>Withdraw From Vault</h2>
                      <p>Available liquidity returns directly to the connected wallet.</p>
                    </div>
                  </div>
                  <span className="count-pill">{dashboard.positions.length} receipt{dashboard.positions.length === 1 ? "" : "s"}</span>
                </div>
                <div className="vault-balance-card withdraw-balance-grid">
                  <Metric label="Available to withdraw" value={assetAmount(totalAvailable, vault.asset)} />
                  <Metric label="Max single withdrawal" value={assetAmount(largestSingleReceipt, vault.asset)} />
                  <Metric label="Claimable fees" value={assetAmount(claimableFees, vault.asset)} />
                </div>
                <form className="stack-form console-form" onSubmit={submitWithdrawal}>
                  <label>Amount ({vault.asset})<input value={withdrawAmount} onChange={(event) => setWithdrawAmount(event.target.value)} name="amount" type="number" min="1" step="1" max={largestSingleReceipt || undefined} placeholder={largestSingleReceipt ? String(largestSingleReceipt) : "0"} required /></label>
                  {formError ? <p className="form-error">{formError}</p> : null}
                  <div className="withdraw-actions">
                    <button type="button" className="ghost-button" onClick={() => setWithdrawAmount(String(largestSingleReceipt))} disabled={!largestSingleReceipt || withdrawalRunning}>Max</button>
                    <button type="submit" className="gold-button" disabled={!largestSingleReceipt || withdrawalRunning}>
                      {withdrawalRunning ? <Loader2 className="spin" size={16} /> : <ArrowRight size={16} />} Withdraw
                    </button>
                  </div>
                </form>
                <button type="button" className="ghost-button claim-all-button" onClick={() => claimablePosition ? onClaimFees(claimablePosition.id) : undefined} disabled={!claimablePosition || busy?.startsWith("claim-")}>
                  {busy?.startsWith("claim-") ? <Loader2 className="spin" size={16} /> : <Banknote size={16} />} Claim fees
                </button>
                <ActionTransactionPanel state={settlementAction} />
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function VaultSuccessReceiptCard({ title, message, asset, amount, txHash, explorerUrl, onClose }: {
  title: string;
  message: string;
  asset: string;
  amount?: number;
  txHash: string;
  explorerUrl?: string;
  onClose: () => void;
}) {
  const href = explorerUrl ?? transactionExplorerUrl(txHash);

  return (
    <div className="vault-success-card" role="status" aria-live="polite">
      <button type="button" className="receipt-close-button" aria-label="Close receipt" onClick={onClose}>
        <X size={18} />
      </button>
      <div className="success-check-orb">
        <CheckCircle2 size={44} />
      </div>
      <div className="success-copy">
        <h2>{title}</h2>
        <p>{message}</p>
      </div>
      <div className="success-details-card">
        <strong>Transaction Details</strong>
        <div>
          <span>Asset</span>
          <b>{asset}</b>
        </div>
        {amount ? (
          <div>
            <span>Amount</span>
            <b>{assetAmount(amount, asset)}</b>
          </div>
        ) : null}
        <label>
          Transaction Hash
          <span>
            <code title={txHash}>{txHash}</code>
            <button type="button" aria-label="Copy transaction hash" title="Copy transaction hash" onClick={() => copyText(txHash)}><Copy size={15} /></button>
          </span>
        </label>
      </div>
      <a className="receipt-explorer-link success-explorer-link" href={href} target="_blank" rel="noreferrer">
        View on testnet explorer <ExternalLink size={16} />
      </a>
      <button type="button" className="ghost-button success-back-button" onClick={onClose}>
        Back to dashboard
      </button>
    </div>
  );
}

type TransactionActivityKind = "supply" | "withdraw" | "reserve" | "channel" | "fee";
type TransactionActivityFilter = "all" | TransactionActivityKind;

type TransactionActivityEntry = {
  id: string;
  kind: TransactionActivityKind;
  title: string;
  description: string;
  amount: number;
  asset: string;
  status: string;
  txHash: string | null;
  createdAt: string;
};

function TransactionActivity({ dashboard }: { dashboard: Dashboard }) {
  const [filter, setFilter] = useState<TransactionActivityFilter>("all");
  const entries = useMemo(() => buildTransactionActivity(dashboard), [dashboard]);
  const filteredEntries = filter === "all" ? entries : entries.filter((entry) => entry.kind === filter);
  const filters: { id: TransactionActivityFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "supply", label: "Supply" },
    { id: "withdraw", label: "Withdraw" },
    { id: "reserve", label: "Reserve" },
    { id: "channel", label: "Channel" },
    { id: "fee", label: "Fee" },
  ];

  if (!entries.length) {
    return <EmptyState title="No transaction activity" text="Supplies, withdrawals, claims, and capacity requests will appear here after Core accepts them." />;
  }

  return (
    <div className="transaction-activity-shell">
      <div className="activity-filter-bar" role="tablist" aria-label="Transaction activity filters">
        {filters.map((item) => (
          <button type="button" key={item.id} role="tab" aria-selected={filter === item.id} data-active={filter === item.id} onClick={() => setFilter(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      {!filteredEntries.length ? (
        <EmptyState title={`No ${filter} activity`} text="Transactions matching this filter will appear here after Core accepts them." />
      ) : (
        <div className="transaction-activity-list">
          {filteredEntries.map((entry) => (
            <article className="transaction-activity-row" key={entry.id} data-kind={entry.kind}>
              <span className="activity-kind-icon">{activityIcon(entry.kind)}</span>
              <div className="activity-main">
                <strong>{entry.title}</strong>
                <span>{entry.description}</span>
                {entry.txHash ? <TxMiniLink txHash={entry.txHash} label="Explorer" /> : null}
              </div>
              <div className="activity-meta">
                <strong>{assetAmount(entry.amount, entry.asset)}</strong>
                <span className="status-tag" data-status={entry.status}>{statusLabel(entry.status)}</span>
                <time>{formatActivityTime(entry.createdAt)}</time>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function activityIcon(kind: TransactionActivityKind) {
  if (kind === "supply") return <PlusCircle size={18} />;
  if (kind === "withdraw") return <ArrowDownToLine size={18} />;
  if (kind === "fee") return <Banknote size={18} />;
  if (kind === "channel") return <Route size={18} />;
  return <ReceiptText size={18} />;
}

function buildTransactionActivity(dashboard: Dashboard): TransactionActivityEntry[] {
  const deposits = dashboard.deposits.map((deposit) => ({
    id: `deposit-${deposit.id}`,
    kind: "supply" as const,
    title: "Supply liquidity",
    description: deposit.lp_name,
    amount: deposit.amount,
    asset: deposit.asset,
    status: "settled",
    txHash: deposit.tx_hash,
    createdAt: deposit.created_at,
  }));
  const withdrawals = dashboard.withdrawals.map((withdrawal) => ({
    id: `withdrawal-${withdrawal.id}`,
    kind: "withdraw" as const,
    title: "Withdraw liquidity",
    description: withdrawal.lp_name,
    amount: withdrawal.amount,
    asset: withdrawal.asset,
    status: withdrawal.status,
    txHash: withdrawal.tx_hash,
    createdAt: withdrawal.created_at,
  }));
  const claims = dashboard.fee_claims.map((claim) => ({
    id: `claim-${claim.id}`,
    kind: "fee" as const,
    title: "Claim fees",
    description: claim.position_id,
    amount: claim.amount,
    asset: claim.asset,
    status: claim.status,
    txHash: claim.tx_hash,
    createdAt: claim.created_at,
  }));
  const requests = dashboard.liquidity_requests
    .filter((request) => request.request_tx_hash)
    .map((request) => ({
      id: `request-${request.id}`,
      kind: request.status === "funding_required" || request.status === "funding_submitted" || request.status === "pending_fiber_channel" || request.status === "channel_open" ? "channel" as const : "reserve" as const,
      title: requestActivityTitle(request),
      description: requestActivityDescription(request),
      amount: request.amount,
      asset: request.asset,
      status: request.status,
      txHash: request.request_tx_hash,
      createdAt: request.created_at,
    }));

  return [...deposits, ...withdrawals, ...claims, ...requests]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);
}

function requestActivityTitle(request: LiquidityRequest) {
  if (request.status === "channel_open") return "Fiber channel active";
  if (request.status === "funding_required") return "Vault funding required";
  if (request.status === "funding_submitted") return "Vault funding submitted";
  if (request.status === "pending_fiber_channel") return "Fiber confirmation pending";
  if (request.status === "released" || request.status === "expired") return "Capacity released";
  if (request.status === "failed") return "Capacity request failed";
  return "Reserve capacity";
}

function requestActivityDescription(request: LiquidityRequest) {
  if (request.status === "funding_required") return `${request.merchant_name} has reserved LP liquidity; funding transaction is next`;
  if (request.status === "funding_submitted") return `${request.merchant_name} is waiting for Fiber to report the channel active`;
  if (request.status === "pending_fiber_channel") return `${request.merchant_name} is waiting for channel confirmation`;
  if (request.status === "channel_open") return `${request.merchant_name} can receive through the opened lane`;
  if (request.status === "released" || request.status === "expired") return `${request.merchant_name} reservation returned to vault availability`;
  if (request.status === "failed") return `${request.merchant_name} request needs repair before execution`;
  return request.merchant_name;
}

function MerchantTerminalView({ dashboard, busy, quote, fiberRpcConfigured, fundingMode, onRequest }: {
  dashboard: Dashboard;
  busy: string | null;
  quote: LiquidityQuote | null;
  fiberRpcConfigured: boolean;
  fundingMode: string;
  onRequest: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const vault = dashboard.vault;
  const walletAccess = merchantWalletAccess(dashboard);
  return (
    <div className="console-grid merchant-grid">
      <section className="console-panel merchant-access-panel">
        <div className="panel-title split-title">
          <div>
            <h2>Wallet Liquidity Access</h2>
            <p>Capacity this merchant wallet has reserved from LP vault liquidity.</p>
          </div>
          <span className="count-pill">{shortAddress(dashboard.user.ckb_address)}</span>
        </div>
        <div className="merchant-access-grid">
          <Metric label="Available to reserve" value={assetAmount(vault.available_liquidity, vault.asset)} />
          <Metric label="Reserved for this wallet" value={assetAmount(walletAccess.reserved, vault.asset)} />
          <Metric label="Channel-open capacity" value={assetAmount(walletAccess.open, vault.asset)} />
          <Metric label="Lease fees posted" value={assetAmount(walletAccess.fees, vault.asset)} />
        </div>
        <p className="merchant-access-note">Reserved capacity stays protected in the vault until LiquidLane creates a vault-funded Fiber funding transaction.</p>
      </section>

      <section className="console-panel reserve-form-panel">
        <div className="panel-title">
          <Link2 size={22} />
          <div>
            <h2>Reserve Liquidity</h2>
            <p>Reserve receive capacity on-chain. LiquidLane then prepares vault-funded Fiber execution from LP liquidity.</p>
          </div>
        </div>
        <div className="merchant-guidance">
          <HelpCircle size={18} />
          <div>
            <strong>Use Fiber node details, not a CKB wallet address.</strong>
            <span>The pubkey is required. The multiaddr is optional and should look like /ip4/.../tcp/8228/p2p/&lt;peer_id&gt; when the node is reachable.</span>
          </div>
        </div>
        <form className="stack-form console-form" onSubmit={onRequest}>
          <label>
            Receiving Fiber pubkey
            <small className="field-help">Required. Compressed 33-byte node pubkey, starting with 02 or 03.</small>
            <input name="fiber_peer_pubkey" placeholder="02b6...be71" required />
          </label>
          <label>
            Fiber node multiaddr
            <small className="field-help">Optional. Leave blank if you only have the pubkey. Never paste a ckt/ckb wallet address here.</small>
            <input name="fiber_peer_address" placeholder="/ip4/203.0.113.10/tcp/8228/p2p/12D3..." />
          </label>
          <label>Requested capacity<input name="amount" type="number" min="1" placeholder="200" required /></label>
          <div className="form-row">
            <label>Asset<input name="asset" value={vault.asset} readOnly required /></label>
            <label>Days<input name="duration_days" type="number" min="1" defaultValue="30" required /></label>
          </div>
          <button type="submit" className="gold-button" disabled={busy === "request"}>{busy === "request" ? <Loader2 className="spin" size={16} /> : <ArrowRight size={16} />} Reserve capacity</button>
        </form>
        {quote ? (
          <div className="quote-strip">
            <Metric label="Capacity" value={assetAmount(quote.amount, quote.asset)} />
            <Metric label="Est. fee" value={assetAmount(quote.lease_fee, quote.asset)} />
            <span className="status-tag" data-status={quote.available ? "available" : "failed"}>{quote.available ? "available" : "insufficient"}</span>
          </div>
        ) : null}
      </section>

      <section className="console-panel queue-panel">
        <div className="panel-title split-title">
          <div>
            <h2>Capacity Queue</h2>
            <p>{dashboard.liquidity_requests.length} request{dashboard.liquidity_requests.length === 1 ? "" : "s"} tracked by LiquidLane.</p>
          </div>
          <span className="count-pill">{dashboard.vault.active_requests} Active</span>
        </div>
        <RequestQueue requests={dashboard.liquidity_requests} busy={busy} fiberRpcConfigured={fiberRpcConfigured} fundingMode={fundingMode} />
      </section>
    </div>
  );
}


function merchantWalletAccess(dashboard: Dashboard) {
  const activeReservations = dashboard.reservations.filter((reservation) => reservation.status === "reserved");
  const openReservations = dashboard.reservations.filter((reservation) => reservation.status === "deployed");
  const requestsWithFees = dashboard.liquidity_requests.filter((request) => request.request_tx_hash);
  return {
    reserved: activeReservations.reduce((total, reservation) => total + reservation.amount, 0),
    open: openReservations.reduce((total, reservation) => total + reservation.amount, 0),
    fees: requestsWithFees.reduce((total, request) => total + request.lease_fee, 0),
  };
}


function VaultStatsView({ dashboard, utilization, claimableFees, busy, onWithdrawPosition, onClaimFees }: {
  dashboard: Dashboard;
  utilization: number;
  claimableFees: number;
  busy: string | null;
  onWithdrawPosition: (id: string, amount?: number) => void;
  onClaimFees: (id: string) => void;
}) {
  const vault = dashboard.vault;
  return (
    <div className="vault-layout">
      <section className="operation-panel console-vault-overview" aria-label="LiquidLane vault overview">
        <div className="panel-header">
          <span>{vault.asset} Vault</span>
          <strong>{utilization}% used</strong>
        </div>
        <div className="meter" aria-hidden="true"><span style={{ width: `${Math.max(utilization, 2)}%` }} /></div>
        <div className="metric-grid">
          <Metric label="Total supplied" value={assetAmount(vault.total_deposits, vault.asset)} />
          <Metric label="Available for requests" value={assetAmount(vault.available_liquidity, vault.asset)} />
          <Metric label="Reserved" value={assetAmount(vault.reserved_liquidity, vault.asset)} />
          <Metric label="Pending Fiber" value={assetAmount(vault.pending_channel_liquidity, vault.asset)} />
          <Metric label="Channel open" value={assetAmount(vault.deployed_liquidity, vault.asset)} />
          <Metric label="Claimable fees" value={assetAmount(claimableFees, vault.asset)} />
          <Metric label="LPs" value={String(vault.lp_count)} />
        </div>
      </section>
      <AccountingPanels dashboard={dashboard} claimableFees={claimableFees} busy={busy} onWithdrawPosition={onWithdrawPosition} onClaimFees={onClaimFees} />
    </div>
  );
}

function ReserveTable({ dashboard }: { dashboard: Dashboard }) {
  if (!dashboard.reservations.length) {
    return <EmptyState title="No active reserves" text="Merchant capacity requests reserve supplied liquidity here." />;
  }

  return (
    <div className="reserve-table">
      <div className="reserve-head"><span>Channel / Node ID</span><span>Reserved</span><span>Status</span></div>
      {dashboard.reservations.map((reservation) => (
        <div className="reserve-row" key={reservation.id}>
          <div>
            <span className="row-icon"><Route size={16} /></span>
            <div>
              <strong>{reservation.merchant_name}</strong>
              <code>{shortId(reservation.request_cell_id)}</code>
            </div>
          </div>
          <strong>{assetAmount(reservation.amount, reservation.asset)}</strong>
          <span className="status-tag" data-status={reservation.status}>{statusLabel(reservation.status)}</span>
        </div>
      ))}
    </div>
  );
}

function RequestQueue({ requests, busy, fiberRpcConfigured = true, fundingMode = "vault_external", compact = false }: {
  requests: LiquidityRequest[];
  busy: string | null;
  fiberRpcConfigured?: boolean;
  fundingMode?: string;
  compact?: boolean;
}) {
  if (!requests.length) {
    return <EmptyState title="No capacity requests" text="Requests appear here after a merchant reserves receive capacity." />;
  }

  return (
    <div className={compact ? "request-queue compact" : "request-queue"}>
      {requests.map((request) => {
        const hasPeer = Boolean(request.fiber_peer_pubkey);
        const needsExecutor = !fiberRpcConfigured && (request.status === "requested" || request.status === "funding_required" || request.status === "funding_submitted" || request.status === "pending_fiber_channel");
        const vaultExternalMode = fundingMode === "vault_external";
        return (
        <article className="queue-item" key={request.id} data-status={request.status}>
          <div>
            <span className="queue-status"><Link2 size={15} /></span>
            <div>
              <strong>{assetAmount(request.amount, request.asset)}</strong>
              <span>{request.merchant_name} - {request.duration_days} days</span>
              {request.fiber_peer_pubkey ? <code>Peer: {shortPubkey(request.fiber_peer_pubkey)}</code> : <span>No Fiber peer attached</span>}
              {request.fiber_peer_address ? <code>Address: {shortFiberAddress(request.fiber_peer_address)}</code> : null}
              <code>Request: {shortId(request.request_cell_id)}</code>
              {request.request_tx_hash ? <TxMiniLink txHash={request.request_tx_hash} label="Request tx" /> : null}
              {request.fiber_note ? <span className="queue-note">{request.fiber_note}</span> : null}
              {request.status === "funding_required" ? <span className="queue-note">Vault liquidity is reserved. LiquidLane still needs the v2 vault-funded CKB funding transaction before Fiber can become usable.</span> : null}
              {request.status === "funding_submitted" ? <span className="queue-note">Vault-funded CKB transaction was submitted. Waiting for Fiber to report the channel active.</span> : null}
              {request.status === "pending_fiber_channel" ? <span className="queue-note">Vault liquidity remains reserved while LiquidLane waits for Fiber external-funding confirmation.</span> : null}
              {request.status === "failed" && hasPeer ? <span className="queue-note">LiquidLane could not complete vault-funded Fiber execution. The reserve remains visible for repair or release.</span> : null}
              {!vaultExternalMode ? <span className="queue-note">Diagnostic mode: node-wallet funding is not product capacity.</span> : null}
              {request.status === "released" || request.status === "expired" ? <span className="queue-note">This reservation is no longer active; vault liquidity is available again.</span> : null}
              {request.fiber_error ? <span className="error-text">{request.fiber_error}</span> : null}
              {needsExecutor ? <span className="queue-note">LiquidLane executor is waiting for Fiber RPC before vault-funded execution.</span> : null}
              {!hasPeer ? <span className="error-text">Merchant Fiber pubkey is required before LiquidLane can execute this request.</span> : null}
            </div>
          </div>
          <div className="queue-actions">
            <span className="status-tag" data-status={request.status}>{statusLabel(request.status)}</span>
            {request.channel_id ? <code>{shortHash(request.channel_id)}</code> : request.fiber_temporary_channel_id ? <code>{shortHash(request.fiber_temporary_channel_id)}</code> : busy === request.id ? <Loader2 className="spin" size={14} /> : null}
          </div>
        </article>
        );
      })}
    </div>
  );
}


function AccountingPanels({ dashboard, claimableFees, busy, onWithdrawPosition, onClaimFees }: {
  dashboard: Dashboard;
  claimableFees: number;
  busy: string | null;
  onWithdrawPosition: (id: string, amount?: number) => void;
  onClaimFees: (id: string) => void;
}) {
  return (
    <section className="accounting-grid console-accounting" aria-label="Vault accounting">
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
                <Metric label="Fees" value={assetAmount(Math.max(position.fees_earned - position.fees_claimed, 0), position.asset)} />
              </div>
              <div className="position-footer">
                <span className="status-tag" data-status={position.status}>{statusLabel(position.status)}</span>
                <TxMiniLink txHash={position.supply_tx_hash} label="Supply tx" />
                <button type="button" className="ghost-button small" onClick={() => onWithdrawPosition(position.id)} disabled={busy === `withdraw-${position.id}` || position.available_amount <= 0}>
                  {busy === `withdraw-${position.id}` ? <Loader2 className="spin" size={14} /> : <ArrowRight size={14} />} Withdraw
                </button>
                <button type="button" className="ghost-button small" onClick={() => onClaimFees(position.id)} disabled={busy === `claim-${position.id}` || Math.max(position.fees_earned - position.fees_claimed, 0) <= 0}>
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
                <span>{assetAmount(reservation.amount, reservation.asset)} capacity - fee {assetAmount(reservation.lease_fee, reservation.asset)}</span>
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
            <p className="eyebrow">Vault movement</p>
            <h2>Activity</h2>
          </div>
          <span>{assetAmount(claimableFees, dashboard.vault.asset)} claimable</span>
        </div>
        <div className="activity-list">
          {dashboard.activity.length ? dashboard.activity.map((event) => (
            <div key={event.id}>
              <span><Landmark size={16} /></span>
              <p>{event.label}<strong>{event.amount ? ` ${assetAmount(event.amount, event.asset ?? DEFAULT_ASSET)}` : ""}</strong></p>
            </div>
          )) : <EmptyState title="No activity yet" text="Confirmed wallet, vault, and Fiber events will appear here after Core accepts them." />}
        </div>
      </div>
    </section>
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

function SupplyTransactionPanel({ state }: { state: SupplyTxState | null }) {
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


function ActionTransactionPanel({ state }: { state: ActionTxState | null }) {
  if (!state) return null;
  const actionLabel = {
    request: "Capacity request",
    withdraw: "Withdrawal",
    claim: "Fee claim",
    fiber: "Fiber channel",
  }[state.action];

  return (
    <div className="supply-transaction action-transaction" data-status={state.status} role="status" aria-live="polite">
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
      <div className="tx-receipt-row">
        <span>Action</span>
        <strong>{actionLabel}</strong>
        <small>{state.status}</small>
      </div>
      {state.amount && state.asset ? (
        <div className="supply-context">
          <span>Amount</span>
          <strong>{assetAmount(state.amount, state.asset)}</strong>
        </div>
      ) : null}
      {state.details?.length ? (
        <div className="action-detail-list">
          {state.details.map((detail) => (
            <div key={`${detail.label}-${detail.value}`}>
              <span>{detail.label}</span>
              <code title={detail.value}>{detail.value}</code>
              <button type="button" aria-label={`Copy ${detail.label}`} title={`Copy ${detail.label}`} onClick={() => copyText(detail.value)}><Copy size={13} /></button>
            </div>
          ))}
        </div>
      ) : null}
      {state.action === "fiber" && state.status === "ready" ? (
        <p className="handoff-hint">Fiber accepted the handoff. Vault liquidity stays reserved until the channel is confirmed or retried.</p>
      ) : null}
      {state.error ? <p className="supply-error">{state.error}</p> : null}
      {state.txHash ? (
        <TransactionReceipt txHash={state.txHash} explorerUrl={state.explorerUrl} label={actionLabel} success={state.status === "success"} />
      ) : (
        <p className="muted compact-note">No CKB transaction hash has been broadcast for this action yet.</p>
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

function formatWhole(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
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

function shortFiberAddress(address: string) {
  if (address.length <= 34) return address;
  const peer = address.split("/p2p/")[1] ?? address;
  return `/p2p/${peer.slice(0, 10)}...${peer.slice(-8)}`;
}

function formatActivityTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recent";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function serviceLabel(role: ConsoleView) {
  if (role === "lp") return "Liquidity Provision";
  if (role === "merchant") return "Merchant Terminal";
  return "Portfolio";
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

export function transactionExplorerUrl(txHash: string) {
  return `${EXPLORER_BASE.replace(/\/$/, "")}/transaction/${txHash}`;
}
