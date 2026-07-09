"use client";

import type { FormEvent } from "react";
import {
  AlertTriangle,
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
  KeyRound,
  Landmark,
  Link2,
  Loader2,
  LogOut,
  RadioTower,
  ReceiptText,
  Route,
  Settings,
  Store,
  TerminalSquare,
  UserRound,
  Wifi,
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

export type ConsoleView = Role | "vault";

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
  onViewChange: (view: ConsoleView) => void;
  onConnectWallet: () => void;
  onCopyWalletAddress: (address: string) => void;
  onSignOut: () => void;
  onRefresh: () => void | Promise<void>;
  onDeposit: (event: FormEvent<HTMLFormElement>) => void;
  onRequest: (event: FormEvent<HTMLFormElement>) => void;
  onOpenFiberChannel: (id: string) => void;
  onWithdrawPosition: (id: string) => void;
  onClaimFees: (id: string) => void;
};

const consoleItems: { view: ConsoleView; label: string; detail: string; icon: typeof CircleDollarSign }[] = [
  { view: "lp", label: "Liquidity Provision", detail: "Supply vault capacity", icon: CircleDollarSign },
  { view: "merchant", label: "Merchant Terminal", detail: "Reserve receive capacity", icon: Store },
  { view: "operator", label: "Node Console", detail: "Operate Fiber lanes", icon: RadioTower },
  { view: "vault", label: "Vault Stats", detail: "Audit accounting", icon: Landmark },
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
    onViewChange,
    onConnectWallet,
    onCopyWalletAddress,
    onSignOut,
    onRefresh,
    onDeposit,
    onRequest,
    onOpenFiberChannel,
    onWithdrawPosition,
    onClaimFees,
  } = props;
  const vault = dashboard.vault;
  const ckbRpcConfigured = coreHealth?.ckb_rpc_configured ?? false;
  const betaReady = coreHealth?.beta_ready ?? false;
  const consoleRole = activeView === "vault" ? dashboard.user.role : activeView;
  const title = activeView === "vault" ? "Vault Accounting" : serviceLabel(consoleRole);
  const subtitle = activeView === "lp"
    ? "Provision capacity and monitor LP receipts."
    : activeView === "merchant"
      ? "Reserve inbound channel capacity against live vault liquidity."
      : activeView === "operator"
        ? "Coordinate channel opens and lane health."
        : "Inspect vault state, settlements, and activity.";

  return (
    <main className="console-shell">
      <ConsoleSidebar activeView={activeView} status={status} onViewChange={onViewChange} />
      <section className="console-main">
        <header className="console-topbar">
          <div className="console-titlebar">
            <TerminalSquare size={22} />
            <div>
              <span>{activeView === "vault" ? "Vault Stats" : "Lane Operations"}</span>
              <strong>{title}</strong>
            </div>
          </div>
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
                <span>Beta {betaReady ? "ready" : "warming"}</span>
                <span>Synced {new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit" }).format(new Date())}</span>
              </div>
            </div>
            <div className="console-hero-actions">
              <button type="button" className="ghost-button" onClick={() => onRefresh()} disabled={loading}>{loading ? <Loader2 className="spin" size={16} /> : <Gauge size={16} />} Sync</button>
            </div>
          </section>

          <ActionTransactionPanel state={actionTx} />

          {activeView === "lp" ? (
            <LiquidityProvisionView dashboard={dashboard} utilization={utilization} vaultReady={vaultReady} busy={busy} supplyTx={supplyTx} claimableFees={claimableFees} onDeposit={onDeposit} onWithdrawPosition={onWithdrawPosition} onClaimFees={onClaimFees} />
          ) : activeView === "merchant" ? (
            <MerchantTerminalView dashboard={dashboard} busy={busy} quote={quote} fiberRpcConfigured={fiberRpcConfigured} onRequest={onRequest} onOpenFiberChannel={onOpenFiberChannel} />
          ) : activeView === "operator" ? (
            <NodeConsoleView dashboard={dashboard} busy={busy} utilization={utilization} fiberRpcConfigured={fiberRpcConfigured} onOpenFiberChannel={onOpenFiberChannel} />
          ) : (
            <VaultStatsView dashboard={dashboard} utilization={utilization} claimableFees={claimableFees} busy={busy} onWithdrawPosition={onWithdrawPosition} onClaimFees={onClaimFees} />
          )}
        </div>
      </section>
    </main>
  );
}

function ConsoleSidebar({ activeView, status, onViewChange }: { activeView: ConsoleView; status: string; onViewChange: (view: ConsoleView) => void }) {
  return (
    <aside className="console-sidebar">
      <a className="console-brand" href="#services" aria-label="LiquidLane home">
        <span>LiquidLane</span>
        <small>Management Lifecycle</small>
      </a>
      <nav className="console-nav" aria-label="LiquidLane services">
        {consoleItems.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.view} type="button" data-active={activeView === item.view} onClick={() => onViewChange(item.view)}>
              <Icon size={20} />
              <span>{item.label}<small>{item.detail}</small></span>
            </button>
          );
        })}
      </nav>
      <div className="lane-status">
        <span className="orb"><Wifi size={18} /></span>
        <div>
          <strong>Fiber Lane Status</strong>
          <span><i /> {status.length > 42 ? `${status.slice(0, 42)}...` : status}</span>
        </div>
      </div>
    </aside>
  );
}

function LiquidityProvisionView({ dashboard, utilization, vaultReady, busy, supplyTx, claimableFees, onDeposit, onWithdrawPosition, onClaimFees }: {
  dashboard: Dashboard;
  utilization: number;
  vaultReady: boolean;
  busy: string | null;
  supplyTx: SupplyTxState | null;
  claimableFees: number;
  onDeposit: (event: FormEvent<HTMLFormElement>) => void;
  onWithdrawPosition: (id: string) => void;
  onClaimFees: (id: string) => void;
}) {
  const vault = dashboard.vault;
  return (
    <div className="console-grid lp-grid">
      <section className="stat-card primary-stat">
        <span>Available Vault Capacity</span>
        <strong>{assetAmount(vault.available_liquidity, vault.asset)}</strong>
        <div className="stat-lines">
          <Metric label="Total supplied" value={assetAmount(vault.total_deposits, vault.asset)} />
          <Metric label="Yield accrued" value={assetAmount(vault.fees_earned, vault.asset)} />
        </div>
      </section>

      <section className="console-panel supply-console-card">
        <div className="panel-title">
          <CircleDollarSign size={22} />
          <div>
            <h2>Supply Liquidity</h2>
            <p>Fund the active CKB vault and record an LP receipt.</p>
          </div>
        </div>
        <form className="stack-form console-form" onSubmit={onDeposit}>
          <label>Asset<input name="asset" value={vault.asset} readOnly required /></label>
          <label>Amount ({vault.asset})<input name="amount" type="number" min="1" step="1" placeholder="100" required /></label>
          <div className="form-meter">
            <span>Channel utilization after supply</span>
            <strong>{utilization}%</strong>
            <div><i style={{ width: `${Math.max(utilization, 4)}%` }} /></div>
          </div>
          <button type="submit" className="gold-button" disabled={busy === "deposit" || !vaultReady}>{busy === "deposit" ? <Loader2 className="spin" size={16} /> : <Banknote size={16} />} Confirm Supply</button>
        </form>
        {vaultReady && vault.address ? <p className="muted compact-note">Active vault <code>{shortAddress(vault.address)}</code></p> : <p className="muted compact-note">Vault setup is pending on Core.</p>}
        <SupplyTransactionPanel state={supplyTx} />
      </section>

      <LpPositionsPanel dashboard={dashboard} claimableFees={claimableFees} busy={busy} onWithdrawPosition={onWithdrawPosition} onClaimFees={onClaimFees} />

      <section className="console-panel reserves-panel">
        <div className="panel-title split-title">
          <div>
            <h2>Active Channel Reserves</h2>
            <p>Reserved liquidity across connected Fiber lanes.</p>
          </div>
          <Filter size={18} />
        </div>
        <ReserveTable dashboard={dashboard} />
      </section>
    </div>
  );
}

function LpPositionsPanel({ dashboard, claimableFees, busy, onWithdrawPosition, onClaimFees }: {
  dashboard: Dashboard;
  claimableFees: number;
  busy: string | null;
  onWithdrawPosition: (id: string) => void;
  onClaimFees: (id: string) => void;
}) {
  return (
    <section className="console-panel lp-positions-panel">
      <div className="panel-title split-title">
        <div>
          <h2>Your Vault Positions</h2>
          <p>Withdraw available liquidity or claim earned fees from receipt-backed positions.</p>
        </div>
        <span className="count-pill">{dashboard.positions.length} active</span>
      </div>
      <div className="position-list lp-position-list">
        {dashboard.positions.length ? dashboard.positions.map((position) => {
          const claimable = Math.max(position.fees_earned - position.fees_claimed, 0);
          return (
            <div className="position-card lp-position-card" key={position.id}>
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
                <Metric label="Claimable" value={assetAmount(claimable, position.asset)} />
              </div>
              <div className="position-footer">
                <span className="status-tag" data-status={position.status}>{statusLabel(position.status)}</span>
                <TxMiniLink txHash={position.supply_tx_hash} label="Supply tx" />
                <button type="button" className="gold-button small" onClick={() => onWithdrawPosition(position.id)} disabled={busy === `withdraw-${position.id}` || position.available_amount <= 0}>
                  {busy === `withdraw-${position.id}` ? <Loader2 className="spin" size={14} /> : <ArrowRight size={14} />} Withdraw
                </button>
                <button type="button" className="ghost-button small" onClick={() => onClaimFees(position.id)} disabled={busy === `claim-${position.id}` || claimable <= 0}>
                  {busy === `claim-${position.id}` ? <Loader2 className="spin" size={14} /> : <Banknote size={14} />} Claim
                </button>
              </div>
            </div>
          );
        }) : <EmptyState title="No LP positions yet" text="Supply liquidity to mint a receipt-backed vault position, then withdrawals will appear here." />}
      </div>
      <p className="muted compact-note">{assetAmount(claimableFees, dashboard.vault.asset)} fees are currently claimable across your visible LP positions.</p>
    </section>
  );
}

function MerchantTerminalView({ dashboard, busy, quote, fiberRpcConfigured, onRequest, onOpenFiberChannel }: {
  dashboard: Dashboard;
  busy: string | null;
  quote: LiquidityQuote | null;
  fiberRpcConfigured: boolean;
  onRequest: (event: FormEvent<HTMLFormElement>) => void;
  onOpenFiberChannel: (id: string) => void;
}) {
  const vault = dashboard.vault;
  return (
    <div className="console-grid merchant-grid">
      <section className="console-panel reserve-form-panel">
        <div className="panel-title">
          <Link2 size={22} />
          <div>
            <h2>Reserve Liquidity</h2>
            <p>Queue a receive-capacity request against live vault liquidity.</p>
          </div>
        </div>
        <form className="stack-form console-form" onSubmit={onRequest}>
          <label>Fiber peer pubkey<input name="fiber_peer_pubkey" placeholder="02..." /></label>
          <label>Fiber peer address<input name="fiber_peer_address" placeholder="/ip4/.../tcp/8228/p2p/..." /></label>
          <label>Requested capacity<input name="amount" type="number" min="1" placeholder="10000" required /></label>
          <div className="form-row">
            <label>Asset<input name="asset" value={vault.asset} readOnly required /></label>
            <label>Days<input name="duration_days" type="number" min="1" defaultValue="30" required /></label>
          </div>
          <button type="submit" className="gold-button" disabled={busy === "request"}>{busy === "request" ? <Loader2 className="spin" size={16} /> : <ArrowRight size={16} />} Initiate Channel Open</button>
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
            <p>{dashboard.liquidity_requests.length} request{dashboard.liquidity_requests.length === 1 ? "" : "s"} tracked by Core.</p>
          </div>
          <span className="count-pill">{dashboard.vault.active_requests} Active</span>
        </div>
        <RequestQueue requests={dashboard.liquidity_requests} busy={busy} canOpen fiberRpcConfigured={fiberRpcConfigured} onOpenFiberChannel={onOpenFiberChannel} />
      </section>
    </div>
  );
}

function NodeConsoleView({ dashboard, busy, utilization, fiberRpcConfigured, onOpenFiberChannel }: {
  dashboard: Dashboard;
  busy: string | null;
  utilization: number;
  fiberRpcConfigured: boolean;
  onOpenFiberChannel: (id: string) => void;
}) {
  const vault = dashboard.vault;
  const openChannels = dashboard.liquidity_requests.filter((request) => request.status === "channel_open").length;
  const pending = dashboard.liquidity_requests.filter((request) => request.status === "requested" || request.status === "pending_fiber_channel");
  const operations = dashboard.liquidity_requests.filter((request) =>
    request.status === "pending_fiber_channel" || request.status === "channel_open" || request.status === "failed"
  );
  return (
    <div className="operator-layout">
      <section className="operator-stats">
        <div className="stat-card">
          <span>Total Vault Capacity</span>
          <strong>{assetAmount(vault.total_deposits, vault.asset)}</strong>
          <small>{assetAmount(vault.available_liquidity, vault.asset)} available</small>
        </div>
        <div className="stat-card">
          <span>Pending Routing Fees</span>
          <strong>{assetAmount(vault.fees_earned, vault.asset)}</strong>
          <div className="thin-meter"><i style={{ width: `${Math.max(Math.min(utilization, 100), 4)}%` }} /></div>
        </div>
        <div className="stat-card">
          <span>Active Fiber Channels</span>
          <strong>{openChannels}</strong>
          <small>{pending.length} pending opens</small>
        </div>
      </section>

      <section className="topology-panel" aria-label="Fiber handoff readiness">
        <div className="topology-image" />
        <div className="topology-content">
          <span className="topology-badge">{pending.length ? `${pending.length} pending` : "No pending opens"}</span>
          <h2>Fiber handoff readiness</h2>
          <p>{pending.length ? (fiberRpcConfigured ? "Reserved requests are ready for the configured Fiber RPC node." : "Reserved requests are waiting for Core to be connected to a Fiber RPC node.") : "The lane is waiting for merchant requests backed by vault liquidity."}</p>
          <div className="topology-stats">
            <div><strong>{openChannels}</strong><span>open channels</span></div>
            <div><strong>{pending.length}</strong><span>pending opens</span></div>
            <div><strong>{assetAmount(vault.pending_channel_liquidity, vault.asset)}</strong><span>in handoff</span></div>
          </div>
        </div>
      </section>

      <section className="console-panel">
        <div className="panel-title split-title">
          <div>
            <h2>Capacity Request Queue</h2>
            <p>Requests waiting on channel open execution.</p>
          </div>
          <Filter size={18} />
        </div>
        <RequestQueue requests={dashboard.liquidity_requests} busy={busy} canOpen fiberRpcConfigured={fiberRpcConfigured} onOpenFiberChannel={onOpenFiberChannel} compact />
      </section>

      <section className="console-panel operations-panel">
        <div className="panel-title split-title">
          <div>
            <h2>Open Operations</h2>
            <p>Fiber channel execution status.</p>
          </div>
        </div>
        <FiberOperationList requests={operations} />
      </section>
    </div>
  );
}

function VaultStatsView({ dashboard, utilization, claimableFees, busy, onWithdrawPosition, onClaimFees }: {
  dashboard: Dashboard;
  utilization: number;
  claimableFees: number;
  busy: string | null;
  onWithdrawPosition: (id: string) => void;
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
          <Metric label="Available" value={assetAmount(vault.available_liquidity, vault.asset)} />
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

function RequestQueue({ requests, busy, canOpen, fiberRpcConfigured = true, onOpenFiberChannel, compact = false }: {
  requests: LiquidityRequest[];
  busy: string | null;
  canOpen: boolean;
  fiberRpcConfigured?: boolean;
  onOpenFiberChannel: (id: string) => void;
  compact?: boolean;
}) {
  if (!requests.length) {
    return <EmptyState title="No capacity requests" text="Requests appear here after a merchant reserves receive capacity." />;
  }

  return (
    <div className={compact ? "request-queue compact" : "request-queue"}>
      {requests.map((request) => (
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
              {request.fiber_error ? <span className="error-text">{request.fiber_error}</span> : null}
              {request.status === "requested" && canOpen && !fiberRpcConfigured ? <span className="error-text">Set FIBER_RPC_URL on Core before opening this channel.</span> : null}
            </div>
          </div>
          <div className="queue-actions">
            <span className="status-tag" data-status={request.status}>{statusLabel(request.status)}</span>
            {request.status === "requested" && canOpen ? (
              <button type="button" className="ghost-button small" onClick={() => onOpenFiberChannel(request.id)} disabled={busy === request.id || !fiberRpcConfigured} title={!fiberRpcConfigured ? "Set FIBER_RPC_URL on Core before opening Fiber channels." : "Open Fiber channel"}>
                {busy === request.id ? <Loader2 className="spin" size={14} /> : <ArrowUpRight size={14} />} {fiberRpcConfigured ? "Open Fiber" : "Fiber RPC missing"}
              </button>
            ) : request.channel_id ? <code>{shortHash(request.channel_id)}</code> : request.fiber_temporary_channel_id ? <code>{shortHash(request.fiber_temporary_channel_id)}</code> : null}
          </div>
        </article>
      ))}
    </div>
  );
}

function FiberOperationList({ requests }: { requests: LiquidityRequest[] }) {
  if (!requests.length) {
    return <EmptyState title="No active channel operation" text="Channel open operations appear here after capacity is reserved." />;
  }

  return (
    <div className="fiber-operation-list">
      {requests.map((request) => {
        const channelRef = request.channel_id ?? request.fiber_temporary_channel_id;
        return (
          <article key={request.id} className="fiber-operation-card" data-status={request.status}>
            <div>
              <span className="queue-status"><RadioTower size={15} /></span>
              <div>
                <strong>{request.status === "channel_open" ? "Channel open" : request.status === "pending_fiber_channel" ? "Opening" : "Open failed"}</strong>
                <span>{assetAmount(request.amount, request.asset)} for {request.merchant_name}</span>
                {request.fiber_peer_pubkey ? <code>Peer: {shortPubkey(request.fiber_peer_pubkey)}</code> : null}
                {request.fiber_peer_address ? <code>Address: {shortFiberAddress(request.fiber_peer_address)}</code> : null}
                {channelRef ? <code>Fiber ref: {shortHash(channelRef)}</code> : null}
                {request.request_tx_hash ? <TxMiniLink txHash={request.request_tx_hash} label="Request tx" /> : null}
                {request.fiber_note ? <span>{request.fiber_note}</span> : null}
                {request.fiber_error ? <span className="error-text">{request.fiber_error}</span> : null}
              </div>
            </div>
            <span className="status-tag" data-status={request.status}>{statusLabel(request.status)}</span>
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
  onWithdrawPosition: (id: string) => void;
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

function serviceLabel(role: Role) {
  if (role === "lp") return "Liquidity Provision";
  if (role === "merchant") return "Merchant Terminal";
  return "Node Console";
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

export function transactionExplorerUrl(txHash: string) {
  return `${EXPLORER_BASE.replace(/\/$/, "")}/transaction/${txHash}`;
}
