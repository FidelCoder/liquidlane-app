import { useEffect, useRef, useState } from "react";
import { ckbRpcURL } from "@/lib/ckbWallet";
import { api, apiBase, receiverIssue, fresh } from "./api";
import type { Dashboard, Node, Pairing, PairingStatus, Run } from "./types";
import { useNow } from "./clock";

type Props = { pairing: Pairing; token: string; dashboard: Dashboard; busy: boolean; feeFloor: number; run: Run; onPaired: () => Promise<void>; onNew: () => void; onRenew: () => void; onFinish: (node: Node) => void; onContinue?: () => void; onSetupMode?: (mode: NonNullable<Pairing["setup_mode"]>) => void };
export function PairNode({ pairing, token, dashboard, busy, feeFloor, run, onPaired, onNew, onRenew, onFinish, onContinue, onSetupMode }: Props) {
  const [result, setResult] = useState<PairingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [copied, setCopied] = useState("");
  const setupMode = pairing.setup_mode ?? (pairing.role === "provider" ? "new" : "manual");
  const autoFinished = useRef(false);
  const lastPaired = useRef<string | null>(null);
  const pairedId = result?.node?.id;
  useEffect(() => {
    if (pairedId && lastPaired.current !== pairedId) { lastPaired.current = pairedId; void onPaired(); }
  }, [pairedId, onPaired]);
  const now = useNow();
  useEffect(() => {
    let live = true;
    const check = async () => {
      try {
        const status = await api<PairingStatus>(`/market/nodes/pair/${pairing.pairing_id}`, token);
        if (live) { setResult(status); setError(null); }
      } catch (error) { if (live) setError(error instanceof Error ? error.message : String(error)); }
    };
    const initial = setTimeout(() => void check(), 0);
    const timer = setInterval(() => void check(), 5000);
    return () => { live = false; clearTimeout(initial); clearInterval(timer); };
  }, [pairing.pairing_id, token]);
  const node = result?.node && (dashboard.nodes.find(n => n.id === result.node!.id && n.last_seen >= result.node!.last_seen) ?? result.node);
  const expired = !node && (result?.status === "expired" || pairing.expires_at * 1000 <= now);
  const issue = node ? node.role === "merchant" ? receiverIssue(node) : fresh(node.last_seen) ? null : "Paired. Keep the connector running; waiting for an online check-in." : null;
  const command = `liquidlane-connector setup ./liquidlane-pairing.json${setupMode === "new" ? " --new-node --background" : setupMode === "existing" ? " --background" : ""}`;
  useEffect(() => {
    if (!busy && node?.role === "provider" && node.background && !issue && !autoFinished.current) {
      autoFinished.current = true; onFinish(node);
    }
  }, [busy, node, issue, onFinish]);
  function copy(value: string, label: string) { void run(`Copying ${label}`, async () => { await navigator.clipboard.writeText(value); setCopied(label); }); }

  return <section className="panel setup-panel" aria-label="Node pairing progress">
    <div className="section-heading"><div><span className="eyebrow">{pairing.role === "merchant" ? "Receiving node setup · Merchant" : "Funding node setup · Liquidity provider"}</span><h3>{pairing.label}</h3></div><span className={`status ${node && !issue ? "online" : "stale"}`}>{node ? issue ? "Paired" : pairing.role === "provider" ? node.background ? "Running automatically" : "Connected" : "Ready" : expired ? "Code expired" : "Action needed · Run connector"}</span></div>
    <ol className="setup-steps" aria-label="Pairing steps">
      <li className="done"><b>1</b><span>Name your node<small>“{pairing.label}” is its display name.</small></span></li>
      <li className={node ? "done" : "current"}><b>2</b><span>Connect your node<small>{node ? "Node identity verified and linked to your wallet." : pairing.role === "provider" ? "Run the setup command once on your node machine." : "Run setup on the machine that runs Fiber."}</small></span></li>
      <li className={node && !issue ? "done" : node ? "current" : ""}><b>3</b><span>Check connection<small>{node && !issue ? "Your connector is online." : "This page checks automatically."}</small></span></li>
    </ol>
    {error && <p className="notice error" role="alert">Could not check pairing: {error}. Retrying automatically.</p>}
    {node ? <div className="notice" role="status"><h4>{issue ? "Your node is paired" : node.role === "provider" ? "Connected — next, add capital" : "Your node is ready"}</h4><p>{issue ?? (node.role === "merchant" ? "Continue to choose a provider and request capacity." : "Connecting supplied no capital. Continue to see this node’s funding address, add CKB, and publish your offer.")}</p>
      {node.role === "merchant" && !issue && <button className="primary" disabled={busy} onClick={onContinue}>Continue to find capacity</button>}
      <button className={node.role === "provider" ? "primary" : "text-button"} disabled={busy} onClick={() => onFinish(node)}>{node.role === "provider" ? "Continue to add capital" : "Finish setup"}</button>
    </div> : expired ? <div className="notice" role="status"><h4>Your pairing code expired</h4><p>Create a new code, download the new pairing file, and run setup again. Your existing Fiber node and keys stay on its machine.</p><button className="primary" disabled={busy} onClick={onRenew}>Create a new pairing code</button></div> : <>
      <div className="notice"><h4>{pairing.role === "provider" ? "Set up once, then run automatically" : "Next: run the connector on your node machine"}</h4><p>{pairing.role === "provider" ? "Automatic setup creates a local testnet node and runs Fiber and its connector as background services. After the live connection is verified, this page moves to Add capital. You sign the CKB transfer in your wallet." : "This program links your Fiber node to LiquidLane, reports its balance, and processes requests while it is running. Download the settings below, then run the setup command."}</p></div><p>The pairing code links your node to this wallet and lasts 10 minutes. Downloading alone makes no connection or payment.</p>
      {pairing.role === "provider" && <label>Node setup<select aria-label="Node setup" value={setupMode} onChange={event => { onSetupMode?.(event.target.value as NonNullable<Pairing["setup_mode"]>); setCopied(""); }}><option value="new">Create a node & run automatically · Linux x86_64</option><option value="existing">Use my existing node · background connector on Linux</option><option value="manual">Manual setup · other systems</option></select><small>{setupMode === "new" ? "Setup verifies Fiber 0.9.0, creates keys locally, pairs your node, and enables automatic restart. Keep this computer or server powered on." : setupMode === "existing" ? "Setup asks for your running Fiber node’s RPC URL and data folder once, then runs the connector in the background. Keep your existing Fiber service running." : "Connect to an existing Fiber 0.9.0 node and leave the connector running."}</small></label>}
      <form onSubmit={event => {
        event.preventDefault(); const data = new FormData(event.currentTarget);
        void run("Preparing node setup", async () => {
          if (pairing.expires_at * 1000 <= Date.now()) throw new Error("Pairing code expired. Create a new code first.");
          const provider_policy = pairing.role === "provider" ? { max_order_ckb: Number(data.get("order")), max_total_ckb: Number(data.get("total")), min_fee_ckb: Number(data.get("fee")), accept_public_orders: true, auto_approve: true, allowed_merchants: [] } : null;
          if (provider_policy && provider_policy.max_total_ckb < provider_policy.max_order_ckb) throw new Error("Total funding limit must be at least the per-order limit.");
          const setup = { format: "liquidlane-pairing/1", core_url: apiBase, ckb_rpc: ckbRpcURL, owner_address: pairing.account, pairing_code: pairing.pairing_code, expires_at: pairing.expires_at, role: pairing.role, provider_policy };
          const url = URL.createObjectURL(new Blob([JSON.stringify(setup, null, 2)], { type: "application/json" }));
          const link = document.createElement("a"); link.href = url; link.download = "liquidlane-pairing.json"; link.click(); URL.revokeObjectURL(url); setDownloaded(true);
        });
      }}>
        {pairing.role === "provider" && <fieldset><legend>Automatic channel funding</legend><p>Any merchant can choose your published offer. After they accept your quote, your connector opens the channel automatically within these limits.</p>
          <div className="form-grid"><label>Maximum funding per order · CKB<input name="order" type="number" min="200" max="10000000" step="1" required defaultValue="2000" /></label><label>Total channel exposure limit · CKB<input name="total" type="number" min="200" max="10000000" step="1" required defaultValue="5000" /></label></div>
          <label>Minimum accepted opening fee · CKB<input name="fee" type="number" min={feeFloor} step="1" required defaultValue={feeFloor} /></label>
          <small>These are spending limits, not a deposit. After connecting, the next step lets you add CKB to your node. Merchants pay your fee after verified delivery; an opening fee can remain unpaid.</small>
        </fieldset>}
        <button className="primary" disabled={busy}>{pairing.role === "provider" ? downloaded ? "Download connector settings again" : "Download connector settings" : downloaded ? "Download pairing file again" : "Download pairing file"}</button>
      </form>
      <div className="connector-command"><h4>{setupMode === "manual" ? "Run on your node machine" : "Run once on your Linux machine"}</h4><p>Put the downloaded file in a folder for this setup. Open a terminal there and run:</p><pre className="wrap">{command}</pre><button disabled={busy} onClick={() => copy(command, "setup command")}>{copied === "setup command" ? "Copied setup command" : "Copy setup command"}</button>
        <p>{setupMode === "new" ? "No RPC URL or key path to enter. Setup prints your node’s funding address and service status. Once it succeeds, you can close the terminal. It reports whether startup is enabled at boot or login." : setupMode === "existing" ? "Setup verifies your existing node and starts its connector as a background service. You can then close the terminal; Fiber must keep running independently." : "Setup verifies your node, pairs it, and prints its funding address. Keep Fiber and this connector running."}</p>
      </div>
      <details><summary>Install once & understand key security</summary><p>Install or update the connector from your LiquidLane Core checkout before running setup. The website cannot install native programs by itself. If installation takes longer than the pairing code’s 10-minute lifetime, create a fresh code afterward.</p><pre className="wrap">cargo install --locked --path . --bin liquidlane-connector</pre><p>Automatic setup keeps keys and its startup credential in private files on your machine. Software running as your user can access them. Fiber’s RPC stays on localhost, and the connector enforces your funding limits. You sign capital transfers in your browser wallet.</p><p>For an existing node, use a running Fiber 0.9.0 node on CKB testnet. Its launch configuration contains its local RPC URL and data directory. The data directory contains <code>fiber/sk</code>.</p><p>Setup detects the TCP /p2p/ address from the node. Confirm the detected address, or enter an address reachable by the other participant when they run on another machine. Private keys stay on the node machine.</p></details>
      <details><summary>One-time pairing code · expires {new Date(pairing.expires_at * 1000).toLocaleTimeString()}</summary><label>One-time pairing code<input readOnly value={pairing.pairing_code} autoComplete="off" onFocus={event => event.currentTarget.select()} /></label><button disabled={busy} onClick={() => copy(pairing.pairing_code, "pairing code")}>{copied === "pairing code" ? "Copied pairing code" : "Copy pairing code"}</button><p>For a connector you already configured, use its normal pair command with this code. Only pair a node you control.</p></details>
      <button className="text-button" disabled={busy} onClick={onNew}>Start a new setup</button>
    </>}
  </section>;
}
