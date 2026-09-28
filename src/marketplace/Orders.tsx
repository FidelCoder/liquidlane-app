import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { ckbTransactionStatus, openJoyIdPopup, type ConnectedCkbWallet } from "@/lib/ckbWallet";
import { api, balance, ckb, explorer, fresh, short } from "./api";
import { approvalMessage, payFee, savedFee, signProof, verifyQuote } from "./wallet";
import type { Listing, Node, Order, Run } from "./types";
import type { WorkspaceRole } from "./navigation";
import { OrderProgress } from "./OrderProgress";
import { ChannelSettlement } from "./ChannelSettlement";
import { useNow } from "./clock";

type Props = { orders: Order[]; nodes: Node[]; listings: Listing[]; role?: WorkspaceRole; token: string; wallet: ConnectedCkbWallet; busy: boolean; run: Run; onBrowse: (role: WorkspaceRole) => void };
export function Orders(props: Props) {
  const [filter, setFilter] = useState<"all" | WorkspaceRole>("all");
  const role = props.role ?? filter;
  const orders = props.orders.filter(order => role === "all" || (role === "merchant" ? order.owner === props.wallet.ckbAddress : order.quote.fee_recipient === props.wallet.ckbAddress));
  return <section className="market-content"><div className="section-heading"><div><h2>{props.role === "merchant" ? "Your capacity requests" : props.role === "provider" ? "Requests from merchants" : "Your activity"}</h2><p>{props.role === "provider" ? "Track merchant requests, channel openings, and the fees you receive." : "Follow each request from signed quote to verified delivery and fee payment."}</p></div></div>
    {!props.role && <div className="activity-filter" role="group" aria-label="Filter activity">{(["all", "merchant", "provider"] as const).map(value => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === "all" ? "All activity" : value === "merchant" ? "As merchant" : "As provider"}</button>)}</div>}
    {orders.length === 0 && <div className="empty-state"><h3>{role === "provider" ? "No merchant requests yet." : "No capacity requests yet."}</h3><p>{role === "provider" ? "Publish an offer and keep your provider connector running so merchants can request your capacity." : "Pair your receiving node, then request a quote from an online provider."}</p><button className="primary" onClick={() => props.onBrowse(role === "provider" ? "provider" : "merchant")}>{role === "provider" ? "Manage offers" : "Find a provider"}</button></div>}
    <div className="orders-list">{orders.map(order => <OrderCard key={order.id} {...props} order={order} />)}</div>
  </section>;
}
function OrderCard({ order, nodes, listings, token, wallet, busy, run, onBrowse }: Props & { order: Order }) {
  const now = useNow();
  const [copied, setCopied] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [paymentStage, setPaymentStage] = useState<string | null>(null);
  const merchant = order.owner === wallet.ckbAddress;
  const q = order.quote, evidence = order.merchant_evidence;
  const merchantLabel = nodes.find(node => node.id === q.merchant_node)?.label ?? short(order.owner);
  const providerLabel = nodes.find(node => node.id === q.provider_node)?.label ?? listings.find(item => item.provider.id === q.provider_node)?.provider.label ?? short(q.fee_recipient);
  const saved = typeof window === "undefined" ? null : savedFee(order);
  const feeHash = order.fee_tx_hash ?? saved?.hash;
  const overdue = order.fee_status === "overdue";
  const quoteExpired = ["awaiting_quote", "quoted", "accepted"].includes(order.status) && q.expires_at * 1000 <= now;
  const path = `/market/orders/${order.id}`;
  const feeSettled = ["paid", "waived"].includes(order.fee_status);
  useEffect(() => {
    if (!merchant || !feeHash || order.status !== "delivered" || feeSettled || busy) return;
    let live = true, checking = false;
    const check = async () => {
      if (checking) return;
      checking = true;
      try {
        if (await ckbTransactionStatus(feeHash) === "committed" && live) {
          await run("Confirming opening fee", async () => { await api(`${path}/fee`, token, { tx_hash: feeHash }); });
        }
      } catch { /* Retry read-only confirmation; Check confirmation surfaces RPC errors. */ }
      finally { checking = false; }
    };
    const timer = setInterval(() => void check(), 8000);
    return () => { live = false; clearInterval(timer); };
  }, [merchant, feeHash, order.status, feeSettled, busy, path, token, run]);
  function accept() {
    const popup = openJoyIdPopup();
    void run("Signing the accepted quote", async () => {
      try { await verifyQuote(order, wallet); const proof = await signProof(wallet, approvalMessage(order), popup); await api(`${path}/accept`, token, { proof }); }
      finally { popup?.close(); }
    });
  }
  function pay() {
    const popup = saved ? undefined : openJoyIdPopup();
    void run("Processing opening fee", async () => {
      try {
        const hash = await payFee(order, wallet, popup, setPaymentStage);
        setPaymentStage("Payment submitted. Waiting for network confirmation…");
        if (await ckbTransactionStatus(hash) === "committed") await api(`${path}/fee`, token, { tx_hash: hash });
      } catch (error) { setPaymentStage(null); throw error; }
      finally { popup?.close(); }
    });
  }
  return <article className="panel order-card">
    <div className="section-heading"><div><span className="eyebrow">{merchant ? "RECEIVING CAPACITY" : "PROVIDING CAPACITY"}</span><h3>{ckb(q.capacity_ckb)} CKB <span className="muted">initial capacity</span></h3></div><span className={`status ${order.status === "delivered" ? "online" : "stale"}`}>{order.status.replaceAll("_", " ")}</span></div>
    <div className="order-parties"><div data-party="merchant"><span>{merchant ? "You · Merchant" : "Merchant"}</span><strong>{merchantLabel}</strong><small>Receives capacity · Pays {ckb(q.opening_fee_ckb)} CKB after delivery</small></div><div data-party="provider"><span>{merchant ? "Liquidity provider" : "You · Liquidity provider"}</span><strong>{providerLabel}</strong><small>Funds the channel · Receives the opening fee</small></div></div>
    <div className="order-reference"><small className="wrap">Order {order.id}</small><button disabled={busy} onClick={() => void run("Copying order ID", async () => { await navigator.clipboard.writeText(order.id); setCopiedId(true); })}>{copiedId ? "Copied order ID" : "Copy order ID"}</button></div>
    <OrderProgress order={order} merchant={merchant} paymentSaved={!!feeHash} expired={quoteExpired} />
    <ChannelSettlement order={order} />
    <div className="order-metrics"><div><span>{merchant ? "Fee you pay" : "Fee you receive"}</span><b>{ckb(q.opening_fee_ckb)} CKB</b><small>{overdue ? "Overdue" : order.fee_status.replaceAll("_", " ")}</small></div><div><span>{merchant ? "Provider funding" : "Your node funds"}</span><b>{ckb(q.funding_ckb)} CKB</b><small>Includes {q.provider_reserve_ckb} reserve + 1 probe headroom</small></div><div><span>Your node reserve</span><b>{ckb(merchant ? q.merchant_reserve_ckb : q.provider_reserve_ckb)} CKB</b><small>Locked by the native channel, plus network fees</small></div><div><span>Merchant receive capacity</span><b>{evidence ? `${ckb(balance(evidence.inbound_liquidity))} CKB` : "Awaiting evidence"}</b><small>{evidence ? fresh(evidence.observed_at) ? "Fresh merchant observation" : "Stale merchant observation" : "Both nodes must report"}</small></div></div>
    <details><summary>Quote & channel evidence</summary><dl><div><dt>Fee recipient</dt><dd className="wrap">{q.fee_recipient}</dd></div><div><dt>Provider identity</dt><dd className="wrap">{q.provider_pubkey}</dd></div><div><dt>Merchant identity</dt><dd className="wrap">{q.merchant_pubkey}</dd></div><div><dt>Channel policy</dt><dd>{q.public_channel ? "Public" : "Private"} · bidirectional · no duration guarantee</dd></div><div><dt>Quote valid until</dt><dd>{new Date(q.expires_at * 1000).toLocaleString()}</dd></div><div><dt>Provider signature</dt><dd>{order.provider_signature ? "Present; checked before acceptance" : "Pending"}</dd></div><div><dt>Channel ID</dt><dd className="wrap">{order.channel_id ?? "Not reported"}</dd></div><div><dt>Provider state</dt><dd>{order.provider_evidence?.state ?? "Not observed"}</dd></div><div><dt>Merchant state</dt><dd>{evidence?.state ?? "Not observed"}</dd></div><div><dt>Probe payment</dt><dd>{order.probe_received ? "Merchant reports Paid" : "Not received"}</dd></div></dl>
      {order.funding_outpoint && <a href={explorer(order.funding_outpoint.split("#")[0].slice(0, 66))} target="_blank" rel="noreferrer">Funding transaction <ExternalLink size={13} /></a>}
    </details>
    {order.error && <p className="notice error">{order.error}</p>}
    {order.status === "accepted" && !order.automatic && !merchant && !quoteExpired && <p>From the folder containing your provider’s connector.json:<code className="wrap">liquidlane-connector approve ./connector.json {order.id}</code></p>}
    {order.probe_invoice && !order.probe_received && ["verifying", "awaiting_confirmation"].includes(order.status) && <div className="probe-box"><h4>Send this invoice to your test payer</h4><p>The payer sends exactly 1 testnet CKB through your provider to this receiving node. Keep your connector running to detect receipt.</p><textarea readOnly rows={3} value={order.probe_invoice} aria-label="Delivery probe invoice" /><button onClick={() => void run("Copying invoice", async () => { await navigator.clipboard.writeText(order.probe_invoice!); setCopied(true); })}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Copied" : "Copy invoice"}</button></div>}
    {feeHash && <p><a href={explorer(feeHash)} target="_blank" rel="noreferrer">Fee transaction {short(feeHash)} <ExternalLink size={13} /></a>{order.fee_status !== "paid" && " · Awaiting chain verification. Reuse this saved transaction on retry."}</p>}
    {paymentStage && !feeSettled && <p className="notice" role="status">{paymentStage}</p>}
    <div className="actions">
      {order.status === "delivered" && <button disabled={busy} onClick={() => void run("Exporting delivery receipt", async () => {
        const receipt = await api(`${path}/receipt`, token);
        const url = URL.createObjectURL(new Blob([JSON.stringify(receipt, null, 2)], { type: "application/json" }));
        const link = document.createElement("a"); link.href = url; link.download = `liquidlane-${order.id}.json`; link.click(); URL.revokeObjectURL(url);
      })}>Export signed receipt</button>}
      {merchant && order.status === "quoted" && !quoteExpired && <button className="primary" disabled={busy} onClick={accept}>Verify & accept quote</button>}
      {merchant && ["awaiting_quote", "quoted", "accepted"].includes(order.status) && <button disabled={busy} onClick={() => void run("Cancelling order", async () => { await api(`${path}/cancel`, token, {}); })}>Cancel before opening</button>}
      {merchant && order.status === "verifying" && order.probe_received && <button className="primary" disabled={busy} onClick={() => void run("Verifying delivered capacity", async () => { await api(`${path}/verify`, token, {}); })}>Verify delivery</button>}
      {merchant && order.status === "delivered" && !feeSettled && <><button className="primary" disabled={busy} onClick={pay}>{saved ? "Resubmit saved payment" : `Pay ${ckb(q.opening_fee_ckb)} CKB fee`}</button>{feeHash && <button disabled={busy} onClick={() => void run("Checking fee confirmation", async () => {
        if (await ckbTransactionStatus(feeHash) === "committed") await api(`${path}/fee`, token, { tx_hash: feeHash });
        else setPaymentStage("Your signed payment is saved. Waiting for network confirmation; no new signature is needed.");
      })}>Check confirmation</button>}</>}
      {!merchant && order.status === "delivered" && !["paid", "waived"].includes(order.fee_status) && <button disabled={busy} onClick={() => void run("Waiving opening fee", async () => { await api(`${path}/waive-fee`, token, {}); })}>Waive this fee</button>}
      {merchant && ["cancelled", "expired", "failed"].includes(order.status) && <button className="primary" disabled={busy} onClick={() => onBrowse("merchant")}>Find capacity again</button>}
    </div>
  </article>;
}
