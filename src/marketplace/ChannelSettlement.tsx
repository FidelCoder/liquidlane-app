import { explorer } from "./api";
import type { Order } from "./types";

export function ChannelSettlement({ order }: { order: Order }) {
  const peers = [order.provider_evidence, order.merchant_evidence];
  const proof = peers.flatMap(e => e?.settlement ? [e.settlement] : [])
    .sort((a, b) => b.checked_at - a.checked_at)[0];
  const closing = peers.some(e => e && ["Closed", "ShuttingDown"].includes(e.state));
  if (!closing && !proof) return null;
  const hash = proof?.closing_tx_hash ?? peers.find(e => e?.settlement_tx_hash)?.settlement_tx_hash;
  return <div className="notice" role="status" aria-label="Channel settlement">
    <strong>{proof?.confirmed ? "On-chain settlement confirmed" : proof ? "Native settlement pending" : "Settlement awaiting chain verification"}</strong>
    <p>{proof?.confirmed
      ? "The native channel contracts have settled on CKB testnet. Your node’s wallet balance shows the funds currently available."
      : "Committed capacity stays reserved until the native settlement is confirmed."}</p>
    {proof && <p>Checked {new Date(proof.checked_at * 1000).toLocaleString()}{!proof.confirmed && ` · ${proof.pending_outpoints.length} output(s) still to resolve`}</p>}
    {proof?.confirmed && peers.some(e => e?.state === "ShuttingDown" || e?.state_flags?.includes("WAITING")) &&
      <p>Fiber still reports a pending native state. The confirmation above comes from committed CKB transactions.</p>}
    {hash && <a href={explorer(hash)} target="_blank" rel="noreferrer">Closing transaction</a>}
    {proof?.transaction_hashes.filter(tx => tx !== hash).map((tx, i) =>
      <p key={tx}><a href={explorer(tx)} target="_blank" rel="noreferrer">Settlement transaction {i + 1}</a></p>)}
  </div>;
}
