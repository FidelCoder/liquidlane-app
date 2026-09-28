import { useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { api, ckb, fresh, receiverIssue, short } from "./api";
import type { Dashboard, Listing, Run } from "./types";

type Props = { listings: Listing[]; loaded: boolean; dashboard: Dashboard | null; token?: string; busy: boolean; run: Run; onCreated: () => void; onOrders: () => void; onPairNode: () => void; onSignIn: () => void; signInLabel: string };
export function Offers({ listings, loaded, dashboard, token, busy, run, onCreated, onOrders, onPairNode, onSignIn, signInLabel }: Props) {
  const [selected, setSelected] = useState<Listing | null>(null);
  const [capacity, setCapacity] = useState(500);
  const [merchant, setMerchant] = useState("");
  const [requestKey, setRequestKey] = useState("");
  const requestPanel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (selected && token && window.matchMedia("(max-width: 760px)").matches) requestPanel.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [selected, token]);
  const merchants = dashboard?.nodes.filter(node => node.role === "merchant") ?? [];
  const receiver = merchants.find(node => node.id === merchant) ?? merchants.find(node => !receiverIssue(node)) ?? merchants[0];
  const current = selected && (listings.find(item => item.offer.id === selected.offer.id) ?? selected);
  const readiness = !receiver ? "Pair a receiving node to continue."
    : receiverIssue(receiver) ? receiverIssue(receiver)
    : current && (!listings.some(item => item.offer.id === current.offer.id) || !current.online || !fresh(current.provider.last_seen)) ? "This provider offer is no longer available or its connector is offline."
    : current && current.available_capacity_ckb < current.offer.min_capacity_ckb ? "This provider has insufficient capacity for a new order. Choose another available offer."
    : null;
  function outstanding(provider: string) { return dashboard?.orders.some(order => order.owner === dashboard.address && order.quote.provider_node === provider && !["cancelled", "expired", "failed"].includes(order.status) && !(order.status === "delivered" && ["paid", "waived"].includes(order.fee_status))); }
  function choose(listing: Listing) { setSelected(listing); setCapacity(listing.offer.min_capacity_ckb); setMerchant(""); setRequestKey(crypto.randomUUID()); }
  return <section className="market-content">
    <div className="section-heading"><div><h2>Available providers</h2><p>Live offers, with fees agreed before any channel opens.</p></div><span className="muted">{loaded ? `${listings.filter(item => item.online && fresh(item.provider.last_seen)).length} online` : "Connecting…"}</span></div>
    {token && dashboard && <div className="receiver-summary"><div><strong>{receiver ? `Receiving node: ${receiver.label}` : "Set up your receiving node"}</strong><p>{receiver ? receiverIssue(receiver) ?? "Paired, online, and funded. Choose a provider below." : "Pair your own Fiber node once so a provider can open your channel."}</p></div><button onClick={onPairNode} disabled={busy}>{receiver ? "View node" : "Pair receiving node"}</button></div>}
    <div className="request-layout"><div className="provider-list">
    {!loaded && <div className="empty-state">Loading provider offers from the marketplace…</div>}
    {loaded && listings.length === 0 && <div className="empty-state"><h3>No offers published yet.</h3><p>Providers publish their available capacity in Supply Liquidity. New offers appear here automatically.</p></div>}
    <div className="offer-grid">{listings.map(listing => {
      const { offer, provider } = listing;
      const online = listing.online && fresh(provider.last_seen);
      const available = Math.min(offer.max_capacity_ckb, listing.available_capacity_ckb);
      const pending = outstanding(provider.id);
      const own = offer.owner === dashboard?.address;
      return <article className="offer-card" key={offer.id}>
        <div className="offer-top"><span className="node-avatar">{provider.label.slice(0, 2).toUpperCase()}</span><div><small>Liquidity provider</small><h3>{provider.label}</h3><small title={provider.pubkey}>{short(provider.pubkey)}</small></div><span className={`status ${online ? "online" : "stale"}`}>{online ? "Online" : "Offline"}</span></div>
        <div className="offer-capacity">{ckb(available)} <span>CKB</span><small>advertised receive capacity available</small></div>
        <dl><div><dt>Opening fee</dt><dd>{ckb(offer.opening_fee_ckb)} CKB</dd></div><div><dt>Minimum capacity</dt><dd>{ckb(offer.min_capacity_ckb)} CKB</dd></div><div><dt>Channel</dt><dd>{offer.public_channel ? "Public" : "Private"}</dd></div><div><dt>Connection</dt><dd>{listing.automatic ? "Automatic after acceptance" : "Provider approval required"}</dd></div></dl>
        <button className="primary" disabled={busy || own || (!!token && !dashboard) || (!pending && (!online || available < offer.min_capacity_ckb))} onClick={() => { if (pending) onOrders(); else { choose(listing); if (!token) onSignIn(); } }}>{own ? "Your provider offer" : pending ? "Continue existing order" : !token ? `${signInLabel} to request` : "Request a quote"} <ArrowUpRight size={17} /></button>
        <small>{own ? "Use a separate merchant wallet and node to receive capacity." : pending ? "Complete or cancel your current order with this provider first." : !online ? "Provider offline. Waiting for its connector." : available < offer.min_capacity_ckb ? "Provider has insufficient available capacity." : token ? merchants.length ? listing.automatic ? "Choose, accept, and connect automatically. No duration guarantee." : "This provider uses manual approval. No duration guarantee." : "We’ll guide you through pairing your receiving node." : "Connect your wallet, sign in, and pair your receiving node."}</small>
      </article>;
    })}</div></div>
    <aside className="request-sidebar">{current && token ? <section ref={requestPanel} className="panel quote-request" aria-label="Request capacity">
      <div className="section-heading"><div><span className="eyebrow">You · Merchant</span><h3>Request receive capacity</h3></div><button onClick={() => setSelected(null)}>Close</button></div>
      <p className="quote-provider">Liquidity provider <strong>{current.provider.label}</strong></p>
      {merchants.length === 0 ? <div className="notice" role="status">
        <h4>Pair a receiving node to continue</h4>
        <p>Your wallet is signed in. Pair a Fiber receiving node so the provider knows where to open your channel.</p>
        <button className="primary" type="button" disabled={busy} onClick={onPairNode}>Pair receiving node <ArrowUpRight size={17} /></button>
        <p>Setup confirms when your receiving node is online, then brings you back here.</p>
      </div> : <form onSubmit={event => { event.preventDefault(); void run("Requesting provider quote", async () => {
        if (!token || !receiver || readiness) throw new Error(readiness ?? "Select a receiving node.");
        if (!Number.isSafeInteger(capacity)) throw new Error("Enter capacity in whole CKB.");
        await api("/market/orders", token, { offer_id: current.offer.id, merchant_node: receiver.id, capacity_ckb: capacity, idempotency_key: requestKey });
        setSelected(null); onCreated();
      }); }}>
        <div className="form-grid"><label>Your receiving node<select required value={receiver?.id ?? ""} onChange={event => setMerchant(event.target.value)}>{merchants.map(node => <option key={node.id} value={node.id}>{node.label} · {fresh(node.last_seen) ? "online" : "offline"}</option>)}</select></label>
          <label>Initial receive capacity · CKB<input required type="number" min={current.offer.min_capacity_ckb} max={Math.min(current.offer.max_capacity_ckb, current.available_capacity_ckb)} step="1" value={capacity} onChange={event => setCapacity(Number(event.target.value))} /></label></div>
        <div className="quote-costs"><p><strong>From your Fiber node:</strong> {ckb(receiver?.reserve_ckb ?? 99)} CKB is locked as its channel reserve when the channel opens.</p><p><strong>From your browser wallet:</strong> {ckb(current.offer.opening_fee_ckb)} CKB opening fee after verified delivery, plus the transaction fee.</p><p>Requesting a quote makes no payment. Next, review the provider’s signed quote and accept it in your wallet.</p></div>
        {!current.offer.public_channel && <p>A private channel needs a payer with a known route. Automatic public route discovery is unavailable.</p>}
        {readiness && <p className="notice" id="quote-readiness" role="status">{readiness}</p>}
        {receiver && receiverIssue(receiver) && <button type="button" disabled={busy} onClick={onPairNode}>Check receiving node</button>}
        <button className="primary" disabled={busy || !!readiness} aria-describedby={readiness ? "quote-readiness" : undefined}>Request signed quote</button>
      </form>}
    </section> : <section className="panel request-guide"><span className="eyebrow">Your path as a merchant</span><h3>Start receiving payments</h3><ol><li><strong>Pair your receiving node</strong><p>Connect your wallet and the Fiber node you own.</p></li><li><strong>Choose a liquidity provider</strong><p>Request a signed quote for the capacity you need.</p></li><li><strong>Accept, then verify delivery</strong><p>The provider opens your channel. A test payment confirms it can receive.</p></li><li><strong>Pay the opening fee</strong><p>Pay the provider directly after delivery is verified.</p></li></ol><p className="muted">Your node funds its native channel reserve. The quote shows the exact amounts before you accept.</p></section>}</aside></div>
  </section>;
}
