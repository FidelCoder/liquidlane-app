import { useEffect, useState, useSyncExternalStore } from "react";
import { addressToScript } from "@nervosnetwork/ckb-sdk-utils";
import { openJoyIdPopup, type ConnectedCkbWallet } from "@/lib/ckbWallet";
import { ckb, explorer, fresh } from "./api";
import { checkFunding, fundNode, fundingEvent, fundingSnapshot, savedFunding, startAnotherFunding, verifyFundingAddress } from "./nodeFunding";
import { reservedFunding } from "./provider";
import type { Node, Order, Run } from "./types";

function subscribe(listener: () => void) {
  window.addEventListener(fundingEvent, listener); window.addEventListener("storage", listener);
  return () => { window.removeEventListener(fundingEvent, listener); window.removeEventListener("storage", listener); };
}
type Props = { node: Node; orders: Order[]; wallet: ConnectedCkbWallet; minimumCapacity: number; busy: boolean; run: Run; onRefresh: () => Promise<void> };
export function ProviderCapital({ node, orders, wallet, minimumCapacity, busy, run, onRefresh }: Props) {
  const snapshot = useSyncExternalStore(subscribe, () => fundingSnapshot(node), () => null);
  let saved = null, storageError = "";
  try { saved = snapshot ? savedFunding(node) : null; } catch (error) { storageError = String(error instanceof Error ? error.message : error); }
  const [verified, setVerified] = useState<{ address: string; pubkey: string } | null>(null);
  const [addressError, setAddressError] = useState("");
  const [progress, setProgress] = useState("");
  const [copied, setCopied] = useState(false);
  const required = minimumCapacity + Math.max(99, node.reserve_ckb) + 1 + 63 + reservedFunding(node, orders);
  const missing = Math.max(0, required - node.available_ckb);
  const [amount, setAmount] = useState(Math.max(61, missing));
  const address = verified?.address === node.funding?.address && verified?.pubkey === node.pubkey ? verified.address : null;
  const ownFundingWallet = address && JSON.stringify(addressToScript(address)) === JSON.stringify(addressToScript(wallet.ckbAddress));
  const hash = saved?.hash, confirmed = !!saved?.confirmed;

  useEffect(() => {
    let live = true;
    void verifyFundingAddress(node, wallet.ckbAddress).then(address => {
      if (live) { setVerified({ address, pubkey: node.pubkey }); setAddressError(""); }
    }).catch(error => { if (live) { setVerified(null); setAddressError(error instanceof Error ? error.message : String(error)); } });
    return () => { live = false; };
  }, [node, wallet.ckbAddress]);
  useEffect(() => {
    if (!hash || confirmed) return;
    let live = true, checking = false;
    const check = async () => {
      if (checking) return;
      checking = true;
      try {
        const status = await checkFunding(node, wallet.ckbAddress);
        if (live) {
          setProgress(status === "committed" ? "Capital payment confirmed. Your node balance updates automatically." : status === "unknown" ? "Payment saved. Check confirmation or resubmit the same transaction." : "Capital payment submitted. Waiting for CKB confirmation…");
          if (status === "committed") await onRefresh();
        }
      } catch (error) { if (live) setProgress(error instanceof Error ? error.message : String(error)); }
      finally { checking = false; }
    };
    const initial = setTimeout(() => void check(), 0), interval = setInterval(() => void check(), 8000);
    return () => { live = false; clearTimeout(initial); clearInterval(interval); };
  }, [hash, confirmed, node, wallet.ckbAddress, onRefresh]);

  return <section className="panel capital-panel" aria-label={`Capital for ${node.label}`}>
    <span className="eyebrow">STEP 2 · ADD CAPITAL</span><h3>Fund your node</h3>
    <p>Send CKB from your wallet to your Fiber node. This capital funds merchant channels; the keys stay on your node machine.</p>
    <div className="capital-balance"><small>Available in this node’s wallet</small><strong>{ckb(node.available_ckb)} <span>CKB</span></strong><small>{fresh(node.last_seen) ? "Read from CKB by your connected node" : "Last reported balance · connector offline"}</small></div>
    <p className="notice">For an offer starting at <strong>{ckb(minimumCapacity)} CKB</strong>, your node needs <strong>{ckb(required)} CKB</strong> available: capacity + {ckb(Math.max(99, node.reserve_ckb))} reserve + 1 probe headroom + 63 for change and fees{reservedFunding(node, orders) ? ", plus funding reserved for current requests" : ""}. {missing > 0 ? `You need ${ckb(missing)} CKB more.` : "Your current balance covers this amount."}</p>
    {address ? <div className="funding-address"><label>Node’s CKB funding address<input aria-label="Node’s CKB funding address" readOnly value={address} onFocus={event => event.currentTarget.select()} /></label><button disabled={busy} onClick={() => void run("Copying node funding address", async () => { await navigator.clipboard.writeText(address); setCopied(true); })}>{copied ? "Address copied" : "Copy funding address"}</button><small>Verified against your node’s signature. Check that it matches the address printed in your connector terminal.</small></div> : <p className="notice" role="status">{addressError || "Verifying your node’s funding address…"}</p>}
    {storageError && <p className="notice error" role="alert">{storageError}</p>}
    {saved ? <div className="notice" role="status"><h4>{confirmed ? `${ckb(saved.amountCkb)} CKB sent to your node` : `${ckb(saved.amountCkb)} CKB payment saved`}</h4><p>{confirmed ? "Confirmed on CKB. Available capital comes from your node’s next balance report." : progress || "Checking confirmation. Keep this page open or return later to resume the same payment."}</p><a href={explorer(saved.hash)} target="_blank" rel="noreferrer">View capital transaction</a><div className="actions">{confirmed ? <button disabled={busy} onClick={() => void run("Preparing another capital payment", async () => { await startAnotherFunding(node, wallet.ckbAddress); setProgress(""); })}>Add more capital</button> : <><button disabled={busy} onClick={() => void run("Checking capital confirmation", async () => { const status = await checkFunding(node, wallet.ckbAddress); setProgress(status === "committed" ? "Capital payment confirmed." : `Transaction status: ${status}.`); })}>Check confirmation</button><button disabled={busy} onClick={() => void run("Resuming capital payment", async () => { await fundNode(node, saved.amountCkb, wallet, undefined, setProgress); })}>Resubmit saved transaction</button></>}</div></div> : ownFundingWallet ? <p className="notice">Your connected wallet is already this node’s funding wallet. Its available CKB is counted above. To add more, send CKB to this address from another wallet.</p> : <form onSubmit={event => {
      event.preventDefault(); const popup = openJoyIdPopup();
      void run("Adding capital to your node", async () => { try { await fundNode(node, amount, wallet, popup, setProgress); } finally { popup?.close(); } });
    }}><label>Capital to add · CKB<input type="number" min="61" max="10000000" step="1" required value={amount} onChange={event => setAmount(Number(event.target.value))} /></label><small>The wallet asks you to sign a real CKB transfer, plus its transaction fee. You can also send CKB to the address above from another wallet.</small><button className="primary" disabled={busy || !address || !fresh(node.last_seen) || !!storageError}>Add {ckb(amount)} CKB to my node</button>{progress && <p role="status">{progress}</p>}</form>}
  </section>;
}
