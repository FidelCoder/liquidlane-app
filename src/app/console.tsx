"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  Copy,
  Droplet,
  ExternalLink,
  Filter,
  Gauge,
  HelpCircle,
  KeyRound,
  Landmark,
  Link2,
  Loader2,
  LogOut,
  PlusCircle,
  ReceiptText,
  Route,
  RefreshCw,
  Store,
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
      <section className="console-main">
        <header className="console-topbar">
          <button type="button" className="console-home-brand" onClick={onHome} aria-label="Back to LiquidLane home">
            <Droplet size={22} />
            <strong>LiquidLane</strong>
          </button>
          <ConsoleTabs activeView={activeView} onViewChange={onViewChange} />
          <div className="console-actions">
            <a href="https://github.com/FidelCoder/liquidlane-core/blob/main/README.md" target="_blank" rel="noreferrer" aria-label="Open LiquidLane docs"><HelpCircle size={18} /></a>
            <button type="button" aria-label="Sync dashboard" title="Sync dashboard" onClick={() => onRefresh()} disabled={loading}>
              {loading ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}
            </button>
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

          <footer className="console-footer">
            <span>LiquidLane</span>
            <span>The liquidity layer for CKB and Fiber payments</span>
            <span>Built on Nervos CKB &amp; Fiber Network</span>
          </footer>
        </div>
      </section>
    </main>
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
            <h2>{panelMode === "activity" ? "LP History" : "Active Channel Reserves"}</h2>
            <p>{panelMode === "activity" ? "Your supplies, withdrawals, fee claims, and vault reserve movement." : "Reserved liquidity across connected Fiber lanes."}</p>
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
        {panelMode === "activity" ? <TransactionActivity dashboard={dashboard} scope="lp" /> : <ReserveTable dashboard={dashboard} />}
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
      <div className="lp-risk-note">
        <strong>Withdrawable now: {assetAmount(totalAvailable, vault.asset)}</strong>
        <span>Reserved or deployed liquidity stays locked by vault rules until a request is released or a Fiber channel settles.</span>
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
                    <label>Amount ({vault.asset})<input name="amount" type="number" min="200" step="1" placeholder="100" required /></label>
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

type TransactionActivityKind = "supply" | "withdraw" | "reserve" | "channel" | "fee" | "event";
type TransactionActivityFilter = "all" | TransactionActivityKind;
type TransactionActivityScope = Role;

type TransactionActivityDetail = {
  label: string;
  value: string;
  copyable?: boolean;
};

type TransactionActivityEntry = {
  id: string;
  kind: TransactionActivityKind;
  title: string;
  description: string;
  amount: number | null;
  asset: string | null;
  status: string;
  txHash: string | null;
  createdAt: string;
  summary: string;
  details: TransactionActivityDetail[];
};

function TransactionActivity({ dashboard, scope = dashboard.user.role, compact = false }: { dashboard: Dashboard; scope?: TransactionActivityScope; compact?: boolean }) {
  const [filter, setFilter] = useState<TransactionActivityFilter>("all");
  const entries = useMemo(() => buildTransactionActivity(dashboard, scope), [dashboard, scope]);
  const filters = useMemo(() => activityFilters(scope), [scope]);
  const filteredEntries = filter === "all" ? entries : entries.filter((entry) => entry.kind === filter);
  const [selectedEntry, setSelectedEntry] = useState<TransactionActivityEntry | null>(null);

  useEffect(() => {
    if (!filters.some((item) => item.id === filter)) setFilter("all");
  }, [filter, filters]);

  if (!entries.length) {
    return <EmptyState title={activityEmptyTitle(scope)} text={activityEmptyText(scope)} />;
  }

  return (
    <div className={compact ? "transaction-activity-shell compact" : "transaction-activity-shell"}>
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
            <article
              className="transaction-activity-row"
              key={entry.id}
              data-kind={entry.kind}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedEntry(entry)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedEntry(entry);
                }
              }}
            >
              <span className="activity-kind-icon">{activityIcon(entry.kind)}</span>
              <div className="activity-main">
                <strong>{entry.title}</strong>
                <span>{entry.description}</span>
                {entry.txHash ? <TxMiniLink txHash={entry.txHash} label="Explorer" /> : null}
              </div>
              <div className="activity-meta">
                {entry.amount === null || !entry.asset ? null : <strong>{assetAmount(entry.amount, entry.asset)}</strong>}
                <span className="status-tag" data-status={entry.status}>{statusLabel(entry.status)}</span>
                <time>{formatActivityTime(entry.createdAt)}</time>
              </div>
            </article>
          ))}
        </div>
      )}
      {selectedEntry ? <TransactionActivityModal entry={selectedEntry} onClose={() => setSelectedEntry(null)} /> : null}
    </div>
  );
}

function TransactionActivityModal({ entry, onClose }: { entry: TransactionActivityEntry; onClose: () => void }) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const amount = entry.amount !== null && entry.asset ? assetAmount(entry.amount, entry.asset) : null;

  return (
    <div className="history-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="history-modal-card" role="dialog" aria-modal="true" aria-label={entry.title + " details"} onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="receipt-close-button history-close-button" aria-label="Close history details" onClick={onClose}>
          <X size={18} />
        </button>
        <div className="history-modal-head">
          <span className="history-modal-icon" data-kind={entry.kind}>{activityIcon(entry.kind)}</span>
          <div>
            <span className="eyebrow">{entry.kind === "event" ? "Core Event" : "Transaction Record"}</span>
            <h2>{entry.title}</h2>
            <p>{entry.summary}</p>
          </div>
          <span className="status-tag" data-status={entry.status}>{statusLabel(entry.status)}</span>
        </div>

        <div className="history-modal-metrics">
          {amount ? <Metric label="Amount" value={amount} /> : null}
          <Metric label="Status" value={statusLabel(entry.status)} />
          <Metric label="Recorded" value={formatActivityTime(entry.createdAt)} />
        </div>

        <div className="history-modal-section">
          <strong>On-chain</strong>
          {entry.txHash ? (
            <>
              <div className="history-detail-row">
                <span>Tx hash</span>
                <code title={entry.txHash}>{entry.txHash}</code>
                <button type="button" aria-label="Copy transaction hash" title="Copy transaction hash" onClick={() => copyText(entry.txHash!)}><Copy size={14} /></button>
              </div>
              <a className="receipt-explorer-link" href={transactionExplorerUrl(entry.txHash)} target="_blank" rel="noreferrer">
                View on testnet explorer <ExternalLink size={14} />
              </a>
            </>
          ) : (
            <p className="muted compact-note">No CKB transaction hash is attached to this ledger event.</p>
          )}
        </div>

        <div className="history-modal-section">
          <strong>Protocol Details</strong>
          <div className="history-detail-list">
            {entry.details.map((detail) => (
              <div className="history-detail-row" key={detail.label + "-" + detail.value}>
                <span>{detail.label}</span>
                <code title={detail.value}>{detail.value}</code>
                {detail.copyable ? <button type="button" aria-label={"Copy " + detail.label} title={"Copy " + detail.label} onClick={() => copyText(detail.value)}><Copy size={14} /></button> : null}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function activityIcon(kind: TransactionActivityKind) {
  if (kind === "supply") return <PlusCircle size={18} />;
  if (kind === "withdraw") return <ArrowDownToLine size={18} />;
  if (kind === "fee") return <Banknote size={18} />;
  if (kind === "channel") return <Route size={18} />;
  if (kind === "event") return <ReceiptText size={18} />;
  return <ReceiptText size={18} />;
}

function activityFilters(scope: TransactionActivityScope): { id: TransactionActivityFilter; label: string }[] {
  if (scope === "merchant") {
    return [
      { id: "all", label: "All" },
      { id: "reserve", label: "Reserve" },
      { id: "channel", label: "Channel" },
      { id: "fee", label: "Fee" },
    ];
  }
  return [
    { id: "all", label: "All" },
    { id: "supply", label: "Supply" },
    { id: "withdraw", label: "Withdraw" },
    { id: "reserve", label: "Reserve" },
    { id: "channel", label: "Channel" },
    { id: "fee", label: "Fee" },
  ];
}

function activityEmptyTitle(scope: TransactionActivityScope) {
  if (scope === "merchant") return "No merchant history";
  if (scope === "lp") return "No LP history";
  return "No transaction activity";
}

function activityEmptyText(scope: TransactionActivityScope) {
  if (scope === "merchant") return "Reservations, lease fees, and Fiber execution records will appear here after this wallet requests capacity.";
  if (scope === "lp") return "Supplies, withdrawals, fee claims, and reserve movement will appear here after Core accepts them.";
  return "Supplies, withdrawals, claims, and capacity requests will appear here after Core accepts them.";
}

function buildTransactionActivity(dashboard: Dashboard, scope: TransactionActivityScope): TransactionActivityEntry[] {
  const includeVaultActions = scope !== "merchant";
  const deposits = includeVaultActions ? dashboard.deposits.map((deposit) => ({
    id: `deposit-${deposit.id}`,
    kind: "supply" as const,
    title: "Supply liquidity",
    description: deposit.lp_name,
    amount: deposit.amount,
    asset: deposit.asset,
    status: "settled",
    txHash: deposit.tx_hash,
    createdAt: deposit.created_at,
    summary: "This LP supply created or updated a receipt-backed vault position.",
    details: [
      { label: "LP", value: deposit.lp_name },
      { label: "Wallet", value: shortAddress(deposit.ckb_address) },
      { label: "Deposit ID", value: deposit.id, copyable: true },
    ],
  })) : [];
  const withdrawals = includeVaultActions ? dashboard.withdrawals.map((withdrawal) => ({
    id: `withdrawal-${withdrawal.id}`,
    kind: "withdraw" as const,
    title: "Withdraw liquidity",
    description: withdrawal.lp_name,
    amount: withdrawal.amount,
    asset: withdrawal.asset,
    status: withdrawal.status,
    txHash: withdrawal.tx_hash,
    createdAt: withdrawal.created_at,
    summary: "Available LP liquidity returned from the vault to the connected wallet.",
    details: [
      { label: "LP", value: withdrawal.lp_name },
      { label: "Position", value: withdrawal.position_id, copyable: true },
      { label: "Receipt", value: withdrawal.receipt_cell_id, copyable: true },
    ],
  })) : [];
  const claims = includeVaultActions ? dashboard.fee_claims.map((claim) => ({
    id: `claim-${claim.id}`,
    kind: "fee" as const,
    title: "Claim fees",
    description: claim.position_id,
    amount: claim.amount,
    asset: claim.asset,
    status: claim.status,
    txHash: claim.tx_hash,
    createdAt: claim.created_at,
    summary: "Claimable routing or lease fees were paid out to this LP position.",
    details: [
      { label: "Position", value: claim.position_id, copyable: true },
      { label: "Claim ID", value: claim.id, copyable: true },
    ],
  })) : [];
  const requests = dashboard.liquidity_requests
    .filter((request) => request.request_tx_hash)
    .map((request) => ({
      id: `request-${request.id}`,
      kind: request.status === "funding_required" || request.status === "funding_submitted" || request.status === "pending_fiber_channel" || request.status === "channel_open" || request.status === "settled" ? "channel" as const : "reserve" as const,
      title: requestActivityTitle(request),
      description: requestActivityDescription(request),
      amount: request.amount,
      asset: request.asset,
      status: request.status,
      txHash: request.request_tx_hash,
      createdAt: request.created_at,
      summary: requestActivitySummary(request),
      details: requestActivityDetails(request),
    }));
  const fundingTransactions = dashboard.liquidity_requests
    .filter((request) => request.funding_tx_hash)
    .map((request) => ({
      id: `funding-${request.id}`,
      kind: "channel" as const,
      title: "Fiber funding confirmed",
      description: `${request.merchant_name} channel funded from LP vault liquidity`,
      amount: request.amount,
      asset: request.asset,
      status: request.status,
      txHash: request.funding_tx_hash,
      createdAt: request.updated_at,
      summary: "This is the final collaborative CKB funding transaction confirmed by Fiber. LP vault liquidity funds the channel; the receiver reserve is paid by the merchant request transaction.",
      details: [
        { label: "Merchant", value: request.merchant_name },
        { label: "Request cell", value: request.request_cell_id, copyable: true },
        ...(request.funding_out_point ? [{ label: "Funding outpoint", value: request.funding_out_point, copyable: true }] : []),
        ...(request.channel_id ? [{ label: "Fiber channel ID", value: request.channel_id, copyable: true }] : []),
      ],
    }));
  const leaseFees = dashboard.liquidity_requests
    .filter((request) => request.request_tx_hash && request.lease_fee > 0)
    .map((request) => ({
      id: `lease-fee-${request.id}`,
      kind: "fee" as const,
      title: scope === "merchant" ? "Lease fee posted" : "Lease fee earned",
      description: scope === "merchant"
        ? `Fee paid to reserve ${assetAmount(request.amount, request.asset)}`
        : `${request.merchant_name} paid to reserve vault liquidity`,
      amount: request.lease_fee,
      asset: request.asset,
      status: request.status,
      txHash: request.request_tx_hash,
      createdAt: request.created_at,
      summary: scope === "merchant"
        ? "This is the lease fee paid by the merchant to reserve LP vault liquidity. The full wallet delta can also include CKB cell occupied capacity and the network fee."
        : "This lease fee is linked to a merchant reserve and is part of the LP yield accounting.",
      details: [
        { label: "Merchant", value: request.merchant_name },
        { label: "Lease fee", value: assetAmount(request.lease_fee, request.asset) },
    ...(request.receiver_reserve_payment > 0 ? [{ label: "Receiver reserve", value: assetAmount(request.receiver_reserve_payment, request.asset) }] : []),
        { label: "Reserved capacity", value: assetAmount(request.amount, request.asset) },
        { label: "Request cell", value: request.request_cell_id, copyable: true },
      ],
    }));
  const coreEvents = dashboard.activity.map((event) => ({
    id: `event-${event.id}`,
    kind: inferActivityKind(event.label),
    title: event.label,
    description: "Core ledger event",
    amount: event.amount,
    asset: event.asset,
    status: inferActivityStatus(event.label),
    txHash: null,
    createdAt: event.created_at,
    summary: "This is an off-chain Core ledger event. It explains LiquidLane state but is not itself a separate CKB transaction.",
    details: [
      { label: "Event ID", value: event.id, copyable: true },
      { label: "Label", value: event.label },
      { label: "Event status", value: statusLabel(inferActivityStatus(event.label)) },
    ],
  }));

  return [...deposits, ...withdrawals, ...claims, ...requests, ...fundingTransactions, ...leaseFees, ...coreEvents]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, scope === "merchant" ? 14 : 16);
}

function inferActivityKind(label: string): TransactionActivityKind {
  const normalized = label.toLowerCase();
  if (normalized.includes("deposit") || normalized.includes("suppl")) return "supply";
  if (normalized.includes("withdraw")) return "withdraw";
  if (normalized.includes("fee") || normalized.includes("claim")) return "fee";
  if (normalized.includes("fiber") || normalized.includes("channel") || normalized.includes("funding")) return "channel";
  if (normalized.includes("reserve") || normalized.includes("capacity") || normalized.includes("request")) return "reserve";
  return "event";
}

function inferActivityStatus(label: string) {
  const normalized = label.toLowerCase();
  if (normalized.includes("fail") || normalized.includes("timed out") || normalized.includes("timeout") || normalized.includes("rejected")) return "failed";
  if (normalized.includes("waiting") || normalized.includes("pending") || normalized.includes("required") || normalized.includes("submitted") || normalized.includes("handoff")) return "pending";
  if (normalized.includes("released") || normalized.includes("expired")) return "released";
  if (normalized.includes("channel open") || normalized.includes("active")) return "channel_open";
  if (normalized.includes("settled") || normalized.includes("confirmed") || normalized.includes("deposit") || normalized.includes("withdraw") || normalized.includes("reserved receive capacity")) return "settled";
  return "recorded";
}

function requestActivitySummary(request: LiquidityRequest) {
  if (request.status === "failed") return "The on-chain reserve remains visible, but Fiber did not produce the funding transaction needed to activate the channel.";
  if (request.status === "pending_fiber_channel") return "LP liquidity is reserved while LiquidLane waits for Fiber channel confirmation.";
  if (request.status === "funding_submitted") return "The vault-funded CKB candidate is assembled; Fiber is finalizing and broadcasting the collaborative transaction.";
  if (request.status === "funding_required") return "The merchant reserve is confirmed on CKB; LiquidLane is preparing the vault-funded transaction from LP liquidity.";
  if (request.status === "channel_open") return "Fiber reports usable receive capacity for this merchant request.";
  if (request.status === "settled") return "The Fiber channel settled and LP liquidity returned to vault accounting.";
  if (request.status === "released" || request.status === "expired") return "This reserve no longer locks vault liquidity.";
  return "This merchant reserve request is recorded on CKB and tracked by LiquidLane Core.";
}

function requestActivityDetails(request: LiquidityRequest): TransactionActivityDetail[] {
  const details: TransactionActivityDetail[] = [
    { label: "Merchant", value: request.merchant_name },
    { label: "Wallet", value: shortAddress(request.ckb_address) },
    { label: "Request cell", value: request.request_cell_id, copyable: true },
    { label: "Lease fee", value: assetAmount(request.lease_fee, request.asset) },
    { label: "Duration", value: request.duration_days + " days" },
  ];
  if (request.fiber_peer_pubkey) details.push({ label: "Fiber pubkey", value: request.fiber_peer_pubkey, copyable: true });
  if (request.fiber_peer_address) details.push({ label: "Fiber address", value: request.fiber_peer_address, copyable: true });
  if (request.usable_capacity > 0) details.push({ label: "Usable receive capacity", value: assetAmount(request.usable_capacity, request.asset) });
  if (request.receiver_ckb_address) details.push({ label: "Receiver CKB address", value: request.receiver_ckb_address, copyable: true });
  if (request.fiber_temporary_channel_id) details.push({ label: "Fiber handoff ref", value: request.fiber_temporary_channel_id, copyable: true });
  if (request.funding_tx_hash) details.push({ label: "Final funding tx", value: request.funding_tx_hash, copyable: true });
  if (request.funding_out_point) details.push({ label: "Funding outpoint", value: request.funding_out_point, copyable: true });
  if (request.channel_id) details.push({ label: "Channel ID", value: request.channel_id, copyable: true });
  if (request.fiber_note) details.push({ label: "Core note", value: request.fiber_note });
  if (request.fiber_error) details.push({ label: "Fiber error", value: request.fiber_error });
  details.push({ label: "Balance note", value: "JoyID balance change includes the request-cell bond, receiver reserve, lease fee, and network fee. LP channel capacity is not charged to the merchant wallet." });
  return details;
}

function requestActivityTitle(request: LiquidityRequest) {
  if (request.status === "channel_open") return "Fiber channel active";
  if (request.status === "settled") return "Fiber channel settled";
  if (request.status === "funding_required") return "Vault funding preparing";
  if (request.status === "funding_submitted") return "Vault funding finalizing";
  if (request.status === "pending_fiber_channel") return "Fiber confirmation pending";
  if (request.status === "released" || request.status === "expired") return "Capacity released";
  if (request.status === "failed") return "Capacity request failed";
  return "Reserve capacity";
}

function requestActivityDescription(request: LiquidityRequest) {
  if (request.status === "funding_required") return `${request.merchant_name} has reserved LP liquidity; funding transaction is being prepared`;
  if (request.status === "funding_submitted") return `${request.merchant_name} is waiting for Fiber to report the channel active`;
  if (request.status === "pending_fiber_channel") return `${request.merchant_name} is waiting for channel confirmation`;
  if (request.status === "channel_open") return `${request.merchant_name} can receive through the opened lane`;
  if (request.status === "settled") return `${request.merchant_name} channel settled and LP liquidity returned`;
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
        <p className="merchant-access-note">Reserved capacity is not usable yet. It becomes usable only after the vault-funded CKB funding transaction confirms and Fiber reports the channel active.</p>
      </section>

      <MerchantCapacityTimeline requests={dashboard.liquidity_requests} />

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
          <label>
            Receiver CKB reserve address
            <small className="field-help">The testnet CKB address controlled by the receiving Fiber node.</small>
            <input name="receiver_ckb_address" placeholder="ckt1..." required />
          </label>
          <label>Vault capacity allocation<small className="field-help">Includes Fiber channel cell reserve; the quote shows estimated usable receive capacity.</small><input name="amount" type="number" min="200" placeholder="200" required /></label>
          <div className="form-row">
            <label>Asset<input name="asset" value={vault.asset} readOnly required /></label>
            <label>Days<input name="duration_days" type="number" min="1" defaultValue="30" required /></label>
          </div>
          <button type="submit" className="gold-button" disabled={busy === "request"}>{busy === "request" ? <Loader2 className="spin" size={16} /> : <ArrowRight size={16} />} Reserve capacity</button>
        </form>
        {quote ? (
          <div className="quote-summary">
            <div className="quote-strip">
              <Metric label="Vault allocation" value={assetAmount(quote.amount, quote.asset)} />
              <Metric label="Est. usable receive" value={assetAmount(quote.estimated_usable_capacity, quote.asset)} />
              <Metric label="Lease fee" value={assetAmount(quote.lease_fee, quote.asset)} />
              <Metric label="Request bond" value={assetAmount(quote.request_cell_bond, quote.asset)} />
              <Metric label="Receiver reserve" value={assetAmount(quote.receiver_node_reserve_payment, quote.asset)} />
              <span className="status-tag" data-status={quote.available ? "available" : "failed"}>{quote.available ? "available" : "insufficient"}</span>
            </div>
            <div className="merchant-guidance receiver-reserve-note">
              <HelpCircle size={18} />
              <div>
                <strong>One approval funds the complete request.</strong>
                <span>{assetAmount(quote.receiver_node_reserve_payment, quote.asset)} goes to the receiver node: {assetAmount(quote.receiver_node_reserve_min, quote.asset)} protocol reserve plus fee headroom. The LP vault supplies the allocation; Fiber retains {assetAmount(quote.receiver_node_reserve_min, quote.asset)} on the LiquidLane side for channel cell capacity.</span>
              </div>
            </div>
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

      <section className="console-panel merchant-history-panel">
        <div className="panel-title split-title">
          <div>
            <h2>Merchant History</h2>
            <p>Reservations, lease fees, and Fiber execution records for this wallet.</p>
          </div>
          <span className="count-pill">{buildTransactionActivity(dashboard, "merchant").length} Records</span>
        </div>
        <TransactionActivity dashboard={dashboard} scope="merchant" compact />
      </section>
    </div>
  );
}



function MerchantCapacityTimeline({ requests }: { requests: LiquidityRequest[] }) {
  const latest = [...requests].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  const steps = merchantTimelineSteps(latest);

  return (
    <section className="console-panel merchant-timeline-panel">
      <div className="panel-title split-title">
        <div>
          <h2>Capacity Status</h2>
          <p>{latest ? "Latest merchant request lifecycle." : "Reserve capacity to start the lifecycle."}</p>
        </div>
        {latest ? <span className="status-tag" data-status={latest.status}>{statusLabel(latest.status)}</span> : null}
      </div>
      <div className="capacity-timeline">
        {steps.map((step) => (
          <div key={step.label} data-state={step.state}>
            <span>{step.state === "done" ? <CheckCircle2 size={15} /> : step.state === "active" ? <Loader2 size={15} className="spin" /> : <AlertTriangle size={15} />}</span>
            <strong>{step.label}</strong>
            <small>{step.text}</small>
          </div>
        ))}
      </div>
      {latest?.request_tx_hash ? <TxMiniLink txHash={latest.request_tx_hash} label="Request tx" /> : null}
      {latest?.funding_tx_hash ? <TxMiniLink txHash={latest.funding_tx_hash} label="Funding tx" /> : null}
      {latest?.fiber_error ? <p className="error-text">{latest.fiber_error}</p> : null}
    </section>
  );
}

function merchantTimelineSteps(request?: LiquidityRequest) {
  const base = [
    { label: "Request confirmed", text: "Capacity request cell accepted on CKB.", state: "waiting" },
    { label: "Vault reserved", text: "LP liquidity is reserved for this merchant.", state: "waiting" },
    { label: "Funding transaction", text: "Vault-funded CKB transaction prepares Fiber capacity.", state: "waiting" },
    { label: "Channel active", text: "Fiber reports usable receive capacity.", state: "waiting" },
  ];
  if (!request) return base;
  const index = request.status === "settled" || request.status === "channel_open" ? 3
    : request.status === "funding_submitted" || request.status === "pending_fiber_channel" ? 2
    : request.status === "funding_required" || request.status === "requested" ? 1
    : request.status === "failed" ? 2
    : 0;
  return base.map((step, stepIndex) => ({
    ...step,
    state: request.status === "settled" || request.status === "channel_open" ? (stepIndex <= index ? "done" : "waiting") : stepIndex < index ? "done" : stepIndex === index ? (request.status === "failed" ? "failed" : "active") : "waiting",
  }));
}

function merchantWalletAccess(dashboard: Dashboard) {
  const activeReservations = dashboard.reservations.filter((reservation) => reservation.status === "reserved");
  const openRequests = dashboard.liquidity_requests.filter((request) => request.status === "channel_open");
  const requestsWithFees = dashboard.liquidity_requests.filter((request) => request.request_tx_hash);
  return {
    reserved: activeReservations.reduce((total, reservation) => total + reservation.amount, 0),
    open: openRequests.reduce((total, request) => total + request.usable_capacity, 0),
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
              {request.status === "channel_open" ? <span>Usable: {assetAmount(request.usable_capacity, request.asset)}</span> : null}
              <span>{request.merchant_name} - {request.duration_days} days</span>
              {request.fiber_peer_pubkey ? <code>Peer: {shortPubkey(request.fiber_peer_pubkey)}</code> : <span>No Fiber peer attached</span>}
              {request.fiber_peer_address ? <code>Address: {shortFiberAddress(request.fiber_peer_address)}</code> : null}
              <code>Request: {shortId(request.request_cell_id)}</code>
              {request.request_tx_hash ? <TxMiniLink txHash={request.request_tx_hash} label="Request tx" /> : null}
              {request.funding_tx_hash ? <TxMiniLink txHash={request.funding_tx_hash} label="Funding tx" /> : null}
              {request.fiber_note ? <span className="queue-note">{request.fiber_note}</span> : null}
              {request.status === "funding_required" ? <span className="queue-note">Vault liquidity is reserved. LiquidLane is preparing the vault-funded CKB transaction from LP liquidity.</span> : null}
              {request.status === "funding_submitted" ? <span className="queue-note">Vault-funded CKB candidate is assembled. Fiber is finalizing the collaborative transaction.</span> : null}
              {request.status === "pending_fiber_channel" ? <span className="queue-note">Vault liquidity remains reserved while LiquidLane waits for Fiber collaborative funding confirmation.</span> : null}
              {request.status === "failed" && hasPeer ? <span className="queue-note">Fiber did not complete the vault-funded transaction step. The reserve remains visible for retry or release.</span> : null}
              {request.status === "settled" ? <span className="queue-note">This Fiber channel settled; LP liquidity is back in vault availability.</span> : null}
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
    <a className="tx-mini-link" href={transactionExplorerUrl(txHash)} target="_blank" rel="noreferrer" title={txHash} onClick={(event) => event.stopPropagation()}>
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
  if (status === "funding_submitted") return "funding finalizing";
  return status.replaceAll("_", " ");
}

export function transactionExplorerUrl(txHash: string) {
  return `${EXPLORER_BASE.replace(/\/$/, "")}/transaction/${txHash}`;
}
