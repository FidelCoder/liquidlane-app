import { signTransaction, type CKBTransaction } from "@joyid/ckb";
import { addressToScript, rawTransactionToHash } from "@nervosnetwork/ckb-sdk-utils";
import { secp256k1 } from "@noble/curves/secp256k1";
import { hexToBytes } from "@noble/curves/abstract/utils";
import { broadcastCkbTransaction, ckbTransactionStatus, dryRunCkbTransaction, type ConnectedCkbWallet, type JoyIdPopup } from "@/lib/ckbWallet";
import { normalizeCkbTransaction } from "@/lib/ckbTransaction";
import { joyIdConfig } from "./wallet";
import type { Node } from "./types";

const genesis = "0x10639e0895502b5688a6be8cf69460d76541bfa4821629d86d62ba0aae3f9606";
export type FundingTarget = Pick<Node, "id" | "owner" | "pubkey" | "role" | "funding">;
export type SavedFunding = { node: FundingTarget; amountCkb: number; tx: CKBTransaction; hash: string; confirmed?: boolean };
export const fundingEvent = "liquidlane-node-funding-changed";
export const fundingKey = (node: Pick<Node, "id" | "owner">) => `liquidlane:node-funding:${node.owner}:${node.id}`;
export function fundingSnapshot(node: Pick<Node, "id" | "owner">) { return localStorage.getItem(fundingKey(node)); }
export function savedFunding(node: Pick<Node, "id" | "owner">): SavedFunding | null {
  const value = fundingSnapshot(node);
  if (!value) return null;
  try {
    const saved = JSON.parse(value) as SavedFunding;
    if (!saved || !saved.node || !saved.tx || !Number.isSafeInteger(saved.amountCkb) || typeof saved.hash !== "string" || !/^0x[0-9a-f]{64}$/.test(saved.hash)) throw new Error("Invalid saved payment");
    return saved;
  }
  catch { throw new Error("The saved capital payment cannot be read. Reconcile it before sending more capital."); }
}
function save(node: FundingTarget, value: SavedFunding | null) {
  if (value) localStorage.setItem(fundingKey(node), JSON.stringify(value));
  else localStorage.removeItem(fundingKey(node));
  if (typeof window !== "undefined") window.dispatchEvent(new Event(fundingEvent));
}

export async function verifyFundingAddress(node: FundingTarget, owner: string, requireFresh = true): Promise<string> {
  if (node.owner !== owner || node.role !== "provider") throw new Error("Select a provider node paired to your signed-in wallet.");
  const proof = node.funding;
  if (!proof) throw new Error("Start or update your connector to report this node’s funding address.");
  const payload = JSON.parse(proof.payload);
  if (payload.node_id !== node.id || payload.chain_hash !== genesis || payload.version !== "0.9.0" || payload.funding_address !== proof.address || !proof.address.startsWith("ckt1")) throw new Error("The funding address does not match this node’s signed testnet report.");
  if (requireFresh && (!Number.isSafeInteger(payload.at) || Math.abs(Date.now() / 1000 - payload.at) > 90)) throw new Error("Your node’s report is stale. Keep the connector running before adding capital.");
  addressToScript(proof.address);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(proof.payload)));
  if (!secp256k1.verify(hexToBytes(proof.signature), hash, hexToBytes(node.pubkey))) throw new Error("Your node’s funding address signature is invalid.");
  return proof.address;
}
export function fundingTransferRequest(owner: string, recipient: string, amountCkb: number) {
  const lock = addressToScript(recipient);
  const minimum = 41 + (lock.args.length - 2) / 2;
  if (!owner.startsWith("ckt1") || !recipient.startsWith("ckt1") || !Number.isSafeInteger(amountCkb) || amountCkb < minimum || amountCkb > 10_000_000) throw new Error(`Enter a whole CKB amount from ${minimum} to 10,000,000 on testnet.`);
  if (sameScript(addressToScript(owner), lock)) throw new Error("Your connected wallet is already this node’s funding wallet. Its available CKB is already usable by the node.");
  return { from: owner, to: recipient, amount: (BigInt(amountCkb) * BigInt(100_000_000)).toString() };
}
function sameScript(a: { codeHash: string; hashType: string; args: string }, b: typeof a) {
  return a.codeHash === b.codeHash && a.hashType === b.hashType && a.args === b.args;
}
export function checkFundingTransaction(tx: CKBTransaction, request: ReturnType<typeof fundingTransferRequest>) {
  const recipient = addressToScript(request.to), sender = addressToScript(request.from);
  const outputs = tx.outputs.filter(output => sameScript(output.lock, recipient));
  if (outputs.length !== 1 || outputs[0].type || BigInt(outputs[0].capacity) !== BigInt(request.amount)) throw new Error("The signed transaction does not send the chosen capital to your node.");
  if (tx.outputs.length !== tx.outputsData.length || tx.outputsData.some(data => data !== "0x") || tx.outputs.some(output => output.type || (!sameScript(output.lock, recipient) && !sameScript(output.lock, sender)))) throw new Error("Unexpected output in the node funding transaction.");
}
async function validateSaved(saved: SavedFunding, node: FundingTarget, owner: string) {
  if (node.owner !== owner || node.role !== "provider" || !saved?.node || saved.node.id !== node.id || saved.node.pubkey !== node.pubkey || saved.node.owner !== owner) throw new Error("Saved capital payment belongs to another node or wallet.");
  const address = await verifyFundingAddress(saved.node, owner, false);
  const request = fundingTransferRequest(owner, address, saved.amountCkb);
  const tx = normalizeCkbTransaction(saved.tx);
  checkFundingTransaction(tx, request);
  if (rawTransactionToHash(tx) !== saved.hash) throw new Error("Saved capital payment hash does not match its signed transaction.");
  return tx;
}
async function withFundingLock<T>(node: FundingTarget, work: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) return navigator.locks.request(fundingKey(node), work);
  return work();
}
export async function fundNode(node: Node, amountCkb: number, wallet: ConnectedCkbWallet, popup?: JoyIdPopup, onProgress?: (stage: string) => void): Promise<string> {
  return withFundingLock(node, () => sendCapital(node, amountCkb, wallet, popup, onProgress));
}
async function sendCapital(node: Node, amountCkb: number, wallet: ConnectedCkbWallet, popup?: JoyIdPopup, onProgress?: (stage: string) => void): Promise<string> {
  let saved = savedFunding(node);
  if (saved) {
    popup?.close();
    const tx = await validateSaved(saved, node, wallet.ckbAddress);
    onProgress?.("Checking the saved capital payment…");
    if (await ckbTransactionStatus(saved.hash) !== "unknown") return saved.hash;
    onProgress?.("Resubmitting the same signed transaction…");
    if (await broadcastCkbTransaction(tx) !== saved.hash) throw new Error("Submission returned a different transaction hash. Reconcile the saved payment.");
    return saved.hash;
  }
  const address = await verifyFundingAddress(node, wallet.ckbAddress);
  const request = fundingTransferRequest(wallet.ckbAddress, address, amountCkb);
  onProgress?.("Confirm adding capital in JoyID…");
  const tx = normalizeCkbTransaction(await signTransaction(request, { ...joyIdConfig, popup: popup ?? undefined }));
  checkFundingTransaction(tx, request);
  const hash = rawTransactionToHash(tx);
  onProgress?.("Checking the signed capital payment…");
  await dryRunCkbTransaction(tx);
  const target: FundingTarget = { id: node.id, owner: node.owner, pubkey: node.pubkey, role: node.role, funding: node.funding };
  saved = { node: target, amountCkb, tx, hash };
  save(node, saved);
  onProgress?.("Sending CKB to your node. Waiting for confirmation…");
  if (await broadcastCkbTransaction(tx) !== hash) throw new Error("Submission returned a different transaction hash. Reconcile the saved payment.");
  return hash;
}
async function checkCurrentFunding(node: Node, owner: string) {
  const saved = savedFunding(node);
  if (!saved) return null;
  await validateSaved(saved, node, owner);
  const status = await ckbTransactionStatus(saved.hash);
  if (savedFunding(node)?.hash !== saved.hash) throw new Error("The active capital payment changed. Refresh before continuing.");
  if (status === "committed" && !saved.confirmed) save(node, { ...saved, confirmed: true });
  return status;
}
export async function checkFunding(node: Node, owner: string) {
  return withFundingLock(node, () => checkCurrentFunding(node, owner));
}
export async function startAnotherFunding(node: Node, owner: string) {
  return withFundingLock(node, async () => {
    if (await checkCurrentFunding(node, owner) !== "committed") throw new Error("Wait for the current capital payment to confirm before sending another.");
    const saved = savedFunding(node)!;
    localStorage.setItem(`${fundingKey(node)}:receipt:${saved.hash}`, JSON.stringify(saved));
    save(node, null);
  });
}
