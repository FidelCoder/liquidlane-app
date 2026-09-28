import { useState } from "react";
import { addressToScript } from "@nervosnetwork/ckb-sdk-utils";
import type { ConnectedCkbWallet } from "@/lib/ckbWallet";
import { api, ckb, fresh, short } from "./api";
import { useNow } from "./clock";
import { usePairing } from "./pairing";
import { PairNode } from "./PairNode";
import { ProviderCapital } from "./ProviderCapital";
import { ProviderOffer } from "./ProviderOffer";
import { providerIssue } from "./provider";
import type { Dashboard, Node, Pairing, Run } from "./types";

type Props = { dashboard: Dashboard; token: string; wallet: ConnectedCkbWallet; busy: boolean; run: Run; onPaired: () => Promise<void>; onRequests: () => void };
export function ProviderWorkspace({ dashboard, token, wallet, busy, run, onPaired, onRequests }: Props) {
  const [pairing, setPairing] = usePairing(wallet.ckbAddress, "provider");
  const [label, setLabel] = useState("My provider node");
  const [selected, setSelected] = useState("");
  const [setupOpen, setSetupOpen] = useState(false);
  const [minimum, setMinimum] = useState(500);
  const nodes = dashboard.nodes.filter(node => node.role === "provider");
  const node = nodes.find(node => node.id === selected) ?? nodes[0];
  const now = useNow();
  const feeFloor = 41 + (addressToScript(wallet.ckbAddress).args.length - 2) / 2;
  const connected = !!node && fresh(node.last_seen);
  const funded = connected && !providerIssue(node, minimum, dashboard.orders);
  const published = !!node && dashboard.offers.some(offer => offer.provider_node === node.id && offer.enabled && offer.expires_at * 1000 > now);
  const step = !connected ? 0 : !funded && !published ? 1 : !published ? 2 : 3;
  function pair(name: string, setup_mode: Pairing["setup_mode"] = "new") { void run("Preparing provider connection", async () => setPairing({ ...await api<Pairing>("/market/nodes/pair", token, { role: "provider", label: name.trim() }), setup_mode })); }
  function finish(paired: Node) {
    void run("Loading your connected node", async () => {
      await onPaired();
      setSelected(paired.id); setPairing(null); setSetupOpen(false);
      setTimeout(() => document.getElementById("provider-capital")?.scrollIntoView({ block: "start", behavior: "instant" }), 0);
    });
  }
  return <section className="market-content provider-workspace">
    <div className="section-heading"><div><h2>Connect your node. Add capital. Earn opening fees.</h2><p>You supply CKB from a Fiber node you operate. LiquidLane brings merchant requests to that node and records delivery and fees.</p></div></div>
    <ol className="provider-steps" aria-label="Liquidity provider progress">{["Connect node", "Add CKB", "Publish offer", "Serve merchants"].map((title, index) => <li key={title} className={index < step ? "done" : index === step ? "current" : ""} aria-current={index === step ? "step" : undefined}><b>{index < step ? "✓" : index + 1}</b><span>{title}</span></li>)}</ol>
    <details className="provider-help"><summary>What am I supplying, and what does the connector do?</summary><p>You send CKB to your own Fiber node’s wallet. When a merchant accepts your offer, that node puts the required capital into a native payment channel. The merchant can then receive payments through it, and pays your agreed opening fee after delivery.</p><p>The connector is a small program beside Fiber. It links the node to your LiquidLane account, reports its balance, signs quotes, and opens accepted channels within your limits. Automatic setup runs both in the background; keep the computer or server powered on. The pairing file contains connection settings; downloading it supplies no capital.</p><p>This provider flow requires a node you operate. If you have only a browser wallet, choose automatic setup to create the node locally. One local installation is required; making a pairing code alone does not create a node.</p></details>
    {nodes.length > 1 && <label>Funding node<select value={node.id} onChange={event => setSelected(event.target.value)}>{nodes.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}
    {pairing ? <PairNode key={pairing.pairing_id} pairing={pairing} token={token} dashboard={dashboard} busy={busy} feeFloor={feeFloor} run={run} onPaired={onPaired} onNew={() => { setPairing(null); setSetupOpen(true); }} onRenew={() => pair(pairing.label, pairing.setup_mode)} onFinish={finish} onSetupMode={mode => setPairing({ ...pairing, setup_mode: mode })} /> : (setupOpen || !node) ? <section className="panel setup-panel">
      <span className="eyebrow">STEP 1 · CONNECT YOUR NODE</span><h3>Connect your funding node</h3><p>Choose automatic setup to create and run a Fiber testnet node on your Linux machine, or connect an existing node. Then add CKB from your wallet.</p>
      <details className="node-details"><summary>I don’t have a Fiber node yet</summary><p>Choose “Create a node & run automatically” in the next step. Run the setup command once on a Linux x86_64 computer or server you control. It creates the node and starts background services; no RPC URL or key path is needed.</p><p>For another operating system, use the testnet setup guide included with <a href="https://github.com/nervosnetwork/fiber/tree/v0.9.0#readme" target="_blank" rel="noreferrer">Fiber 0.9.0</a>. Keep its wallet keys and data directory; your capital will belong to that node.</p></details>
      <div className="notice"><h4>Install the connector once</h4><p>On your node machine, open a terminal in the <code>liquidlane-core</code> folder and run:</p><pre className="wrap">cargo install --locked --path . --bin liquidlane-connector</pre><p>Then continue below. Setup creates and runs Fiber for you on Linux x86_64 with a user service manager.</p></div>
      <form onSubmit={event => { event.preventDefault(); pair(label); }}><label>Node label<input required maxLength={80} value={label} onChange={event => setLabel(event.target.value)} aria-describedby="provider-label-help" /></label><small id="provider-label-help">A name you choose for the node, such as “My provider node”.</small><button className="primary" disabled={busy || !label.trim()}>Connect provider node</button><small>This prepares the connector settings. No CKB is transferred yet.</small></form>
    </section> : null}
    {node && <><article className="panel provider-node" aria-label={`${node.label} node`}><div className="section-heading"><div><span className="eyebrow">YOUR FUNDING NODE</span><h3>{node.label}</h3></div><span className={`status ${connected ? "online" : "stale"}`}>{connected ? node.background ? "Running automatically" : "Connected" : "Connector offline"}</span></div><p>{connected ? node.background ? "The connector is running as a background service. You can add capital below." : "Your node is connected. Its available capital and offer are below." : "Restart the connector on your node machine so LiquidLane can check balances and process requests."}</p><details><summary>Connection, funding limits & operation</summary><p>Node identity: <code title={node.pubkey}>{short(node.pubkey)}</code></p><p>Per-order funding: {ckb(node.provider_policy?.max_order_ckb ?? 0)} CKB. Total funding limit: {ckb(node.provider_policy?.max_total_ckb ?? 0)} CKB. Committed funding: {ckb(node.provider_policy?.committed_ckb ?? 0)} CKB.</p><p>{node.background ? "Check the service using the connector.json path printed by setup:" : "Enable background startup from the saved connector configuration folder (Linux):"}</p><pre className="wrap">{node.background ? "liquidlane-connector service-status ./connector.json" : "liquidlane-connector service-install ./connector.json"}</pre><p>Keep the node machine powered on. Background services restart after a crash. Setup reports whether automatic startup is available at boot or at login. For manual setup on other systems, use <code>liquidlane-connector run ./connector.json</code>. Pausing your published offer stops new requests. Existing channels continue under Fiber’s native rules.</p>{(!node.provider_policy?.accept_public_orders || !node.provider_policy.auto_approve) && <button disabled={busy} onClick={() => pair(node.label, "existing")}>Set up automatic requests</button>}</details></article>
    <div className="provider-capital-layout" id="provider-capital"><ProviderCapital key={node.id} node={node} orders={dashboard.orders} wallet={wallet} minimumCapacity={minimum} busy={busy} run={run} onRefresh={onPaired} /><ProviderOffer key={`${node.id}:${node.provider_policy?.max_order_ckb}`} node={node} offers={dashboard.offers} orders={dashboard.orders} token={token} feeFloor={feeFloor} minimum={minimum} setMinimum={setMinimum} busy={busy} run={run} onRequests={onRequests} now={now} /></div>
    {!pairing && !setupOpen && <button disabled={busy} onClick={() => setSetupOpen(true)}>Pair another node</button>}</>}
  </section>;
}
