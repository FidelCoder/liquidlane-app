import { useState } from "react";
import { api, ckb } from "./api";
import { availableProviderCapacity, providerIssue } from "./provider";
import type { Node, Offer, Order, Run } from "./types";

type Props = { node: Node; offers: Offer[]; orders: Order[]; token: string; feeFloor: number; minimum: number; setMinimum: (value: number) => void; busy: boolean; run: Run; onRequests: () => void; now: number };
export function ProviderOffer({ node, offers, orders, token, feeFloor, minimum, setMinimum, busy, run, onRequests, now }: Props) {
  const limit = node.provider_policy ? Math.max(0, node.provider_policy.max_order_ckb - node.reserve_ckb - 1) : 10000000;
  const [maximum, setMaximum] = useState(Math.min(1000, limit));
  const minimumFee = Math.max(feeFloor, node.provider_policy?.min_fee_ckb ?? 0);
  const issue = providerIssue(node, minimum, orders);
  const active = offers.find(offer => offer.provider_node === node.id && offer.enabled && offer.expires_at * 1000 > now);
  return <section className="panel setup-panel" aria-label="Provider offer">
    <span className="eyebrow">STEP 3 · PUBLISH CAPACITY</span><h3>Publish a capacity offer</h3><p>This lists how much receiving capacity merchants can buy and the opening fee you charge.</p>
    <form onSubmit={event => {
      event.preventDefault(); const data = new FormData(event.currentTarget);
      void run("Publishing your funded offer", async () => {
        if (issue) throw new Error(issue);
        await api("/market/offers", token, { provider_node: node.id, min_capacity_ckb: minimum, max_capacity_ckb: maximum, opening_fee_ckb: Number(data.get("fee")), public_channel: data.get("public") === "on" });
      });
    }}>
      <div className="form-grid"><label>Minimum receive capacity · CKB<input required type="number" min="100" max={limit} step="1" value={minimum} onChange={event => setMinimum(Number(event.target.value))} /></label><label>Maximum receive capacity · CKB<input required type="number" min={minimum} max={limit} step="1" value={maximum} onChange={event => setMaximum(Number(event.target.value))} /></label></div>
      <label>Opening fee you receive · CKB<input name="fee" required type="number" min={minimumFee} max={maximum} step="1" defaultValue={minimumFee} /><small>Paid to your connected browser wallet after verified delivery. Your wallet and node policy require at least {minimumFee} CKB.</small></label>
      <label className="checkbox"><input name="public" type="checkbox" defaultChecked /> Public bidirectional channel</label>
      <dl><div><dt>Receive capacity currently available</dt><dd>{ckb(availableProviderCapacity(node, orders))} CKB</dd></div><div><dt>Per-channel funding limit</dt><dd>{ckb(node.provider_policy?.max_order_ckb ?? 0)} CKB</dd></div></dl>
      {issue && <p className="notice" role="status">{issue}</p>}
      <button className="primary" disabled={busy || !!issue}>{active ? "Update published offer" : "Publish offer"}</button><small>Publishing moves no money. Your node funds a channel automatically when a merchant accepts a quote, within your limits. Offers last 24 hours.</small>
    </form>
    {active && <div className="active-offer"><span><strong>Visible to merchants</strong><br />{ckb(active.min_capacity_ckb)}–{ckb(active.max_capacity_ckb)} CKB · {ckb(active.opening_fee_ckb)} CKB fee</span><button disabled={busy} onClick={() => void run("Pausing new requests", async () => { await api(`/market/offers/${active.id}/disable`, token, {}); })}>Pause offer</button></div>}
    <div className="provider-earnings"><span className="eyebrow">STEP 4 · SERVE MERCHANTS</span><h4>{active ? "Your connector handles accepted requests" : "Earn fees when merchants use your offer"}</h4><p>Keep Fiber and the connector running. Channel capital stays with your node; merchants pay the agreed opening fee to your wallet after delivery. Fees can remain unpaid.</p><button disabled={busy} onClick={onRequests}>View merchant requests & fees</button></div>
  </section>;
}
