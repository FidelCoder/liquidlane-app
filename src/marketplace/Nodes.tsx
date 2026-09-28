import { useState } from "react";
import { addressToScript } from "@nervosnetwork/ckb-sdk-utils";
import type { ConnectedCkbWallet } from "@/lib/ckbWallet";
import { api, ckb, fresh, receiverIssue, short } from "./api";
import { PairNode } from "./PairNode";
import { ProviderWorkspace } from "./ProviderWorkspace";
import { usePairing } from "./pairing";
import type { WorkspaceRole } from "./navigation";
import type { Dashboard, Pairing, Run } from "./types";

type Props = { role: WorkspaceRole; dashboard: Dashboard; token: string; wallet: ConnectedCkbWallet; busy: boolean; run: Run; onPaired: () => Promise<void>; onBrowse: () => void; onRequests: () => void };
export function Nodes(props: Props) {
  return props.role === "provider" ? <ProviderWorkspace {...props} /> : <ReceivingNodes {...props} />;
}
function ReceivingNodes({ dashboard, token, wallet, busy, run, onPaired, onBrowse }: Props) {
  const [pairing, setPairing] = usePairing(wallet.ckbAddress, "merchant");
  const [label, setLabel] = useState("My receiving node");
  const [setupOpen, setSetupOpen] = useState(false);
  const nodes = dashboard.nodes.filter(node => node.role === "merchant");
  const feeFloor = 41 + (addressToScript(wallet.ckbAddress).args.length - 2) / 2;
  function newSetup() { setPairing(null); setSetupOpen(true); }
  function pair(name: string) {
    void run("Creating node pairing", async () => setPairing(await api<Pairing>("/market/nodes/pair", token, { role: "merchant", label: name.trim() })));
  }
  function finish() { setPairing(null); setSetupOpen(false); }
  return <section className="market-content">
    <div className="section-heading"><div><h2>Your receiving nodes</h2><p>Pair the Fiber node where you want to receive payments.</p></div></div>
    <div className="node-workspace"><div className="node-management">
    <div className="node-grid">{nodes.map(node => {
      const issue = receiverIssue(node), online = fresh(node.last_seen);
      return <article className="panel" key={node.id} aria-label={`${node.label} node`}>
        <div className="section-heading"><h3>{node.label}</h3><span className={`status ${online ? "online" : "stale"}`}>{online ? "Online" : node.last_seen ? "Offline" : "Connecting"}</span></div>
        <p>Your receiving node · Merchant</p>
        <dl><div><dt>Node wallet available</dt><dd>{ckb(node.available_ckb)} CKB</dd></div><div><dt>Required channel reserve</dt><dd>{node.last_seen ? `${ckb(node.reserve_ckb)} CKB` : "Checking…"}</dd></div></dl>
        {issue ? <p className="notice" role="status">{issue}</p> : <div className="notice"><h4>Ready to request capacity</h4><p>Your receiving node is paired, online, and funded.</p><button className="primary" disabled={busy} onClick={onBrowse}>Find capacity</button></div>}
        <details className="node-details"><summary>Node details & troubleshooting</summary><dl><div><dt>Fiber version</dt><dd>{node.version}</dd></div><div><dt>Identity</dt><dd title={node.pubkey}>{short(node.pubkey)}</dd></div></dl><p>TCP /p2p/ address</p><code className="wrap">{node.address}</code><p>The available balance belongs to this Fiber node’s wallet and excludes funds already in channels. Your browser wallet pays the opening fee separately.</p><p>If offline, restart the connector using its saved configuration from its folder:</p><pre className="wrap">liquidlane-connector run ./connector.json</pre></details>
      </article>;
    })}</div>
    {pairing ? <PairNode key={pairing.pairing_id} pairing={pairing} token={token} dashboard={dashboard} busy={busy} feeFloor={feeFloor} run={run} onPaired={onPaired} onNew={newSetup} onRenew={() => pair(pairing.label)} onFinish={finish} onContinue={() => { finish(); onBrowse(); }} /> : (setupOpen || nodes.length === 0) ? <section className="panel setup-panel">
      <span className="eyebrow">STEP 1 OF 3</span><h3>Name and pair your node</h3><p>You need an existing Fiber 0.9.0 node on CKB testnet. The next step connects it to your wallet.</p>
      <form onSubmit={event => { event.preventDefault(); pair(label); }}>
        <p className="node-purpose">Receiving node · You are the merchant</p>
        <label>Node label<input required maxLength={80} value={label} onChange={event => setLabel(event.target.value)} aria-label="Node label" aria-describedby="node-label-help" /></label><small id="node-label-help" className="form-hint">A name you choose so you can recognize this node. You can use the suggested name.</small>
        <button className="primary" disabled={busy || !label.trim()}>Create pairing code</button><small className="form-hint">This generates a code automatically. No payment is made.</small>
      </form>
    </section> : <div className="actions"><button disabled={busy} onClick={newSetup}>Pair another node</button></div>}</div></div>
  </section>;
}
