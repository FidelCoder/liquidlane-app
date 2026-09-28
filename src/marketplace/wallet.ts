import { signChallenge, signTransaction, type CKBTransaction } from "@joyid/ckb";
import { addressToScript, rawTransactionToHash } from "@nervosnetwork/ckb-sdk-utils";
import { secp256k1 } from "@noble/curves/secp256k1";
import { hexToBytes } from "@noble/curves/abstract/utils";
import { broadcastCkbTransaction, ckbRpcURL, ckbTransactionStatus, dryRunCkbTransaction, type ConnectedCkbWallet, type JoyIdPopup } from "@/lib/ckbWallet";
import { normalizeCkbTransaction } from "@/lib/ckbTransaction";
import type { Order, Quote } from "./types";
import { feeTransferRequest } from "./fee";

const config = { name: "LiquidLane", network: "testnet" as const, joyidAppURL: "https://testnet.joyid.dev", joyidServerURL: "https://api.testnet.joyid.dev/api/v1", rpcURL: ckbRpcURL, timeoutInSeconds: 120 };
export const joyIdConfig = config;
export async function signProof(wallet: ConnectedCkbWallet, message: string, popup?: JoyIdPopup) {
  const signed = await signChallenge(message, wallet.ckbAddress, { ...config, popup: popup ?? undefined });
  return { ...signed, scheme: "joyid", address: wallet.ckbAddress };
}
const quoteKeys: (keyof Quote)[] = ["protocol", "network", "order_id", "provider_node", "provider_pubkey", "merchant_node", "merchant_pubkey", "merchant_address", "merchant_account", "capacity_ckb", "funding_ckb", "provider_reserve_ckb", "merchant_reserve_ckb", "opening_fee_ckb", "fee_recipient", "public_channel", "expires_at", "nonce"];
export async function verifyQuote(order: Order, wallet: ConnectedCkbWallet, requireUnexpired = true) {
  const quote = order.quote;
  if (quote.protocol !== "liquidlane-marketplace/1" || quote.network !== "testnet" || quote.order_id !== order.id || quote.merchant_account !== wallet.ckbAddress || (requireUnexpired && quote.expires_at * 1000 <= Date.now())) throw new Error("The quote has expired or belongs to another wallet/network.");
  const canonical = Object.fromEntries(quoteKeys.map(key => [key, quote[key]]));
  const message = `LiquidLane provider quote\n${JSON.stringify(canonical)}`;
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message)));
  const hex = Array.from(hash, byte => byte.toString(16).padStart(2, "0")).join("");
  if (hex !== order.quote_hash || !order.provider_signature || !secp256k1.verify(hexToBytes(order.provider_signature), hash, hexToBytes(quote.provider_pubkey))) throw new Error("The provider signature does not match this quote.");
}
export function approvalMessage(order: Order) {
  return `LiquidLane capacity order approval\nProtocol: liquidlane-marketplace/1\nNetwork: testnet\nOrder: ${order.id}\nQuote SHA-256: ${order.quote_hash}\nThis authorizes only the quoted channel opening and its stated service fee.`;
}

type SavedFee = { hash: string; tx: CKBTransaction; quoteHash: string };
const feeKey = (order: Order) => `liquidlane:fee:${order.owner}:${order.id}`;
export function savedFee(order: Order): SavedFee | null {
  const value = localStorage.getItem(feeKey(order));
  return value ? JSON.parse(value) as SavedFee : null;
}
function checkFeeTransaction(tx: CKBTransaction, order: Order, wallet: ConnectedCkbWallet) {
  const recipient = addressToScript(order.quote.fee_recipient), sender = addressToScript(wallet.ckbAddress);
  const same = (a: typeof recipient, b: typeof recipient) => a.codeHash === b.codeHash && a.hashType === b.hashType && a.args === b.args;
  const outputs = tx.outputs.filter(output => same(output.lock, recipient));
  if (outputs.length !== 1 || outputs[0].type || BigInt(outputs[0].capacity) !== BigInt(order.quote.opening_fee_ckb) * BigInt(100_000_000)) throw new Error("Wallet returned a different fee amount or recipient.");
  if (tx.outputs.some(output => output.type || (!same(output.lock, recipient) && !same(output.lock, sender))) || tx.outputsData.some(data => data !== "0x")) throw new Error("Unexpected output in the fee transaction.");
}
export async function payFee(order: Order, wallet: ConnectedCkbWallet, popup?: JoyIdPopup, onProgress?: (stage: string) => void): Promise<string> {
  if (order.status !== "delivered" || order.owner !== wallet.ckbAddress || ["paid", "waived"].includes(order.fee_status)) throw new Error("No fee is payable by this wallet.");
  // Opening expiry does not cancel an already delivered service fee.
  await verifyQuote(order, wallet, false);
  let saved = savedFee(order);
  const resuming = !!saved;
  if (saved) popup?.close();
  if (!saved) {
    onProgress?.("Confirm the payment in JoyID…");
    const tx = normalizeCkbTransaction(await signTransaction(feeTransferRequest(order), { ...config, popup: popup ?? undefined }));
    checkFeeTransaction(tx, order, wallet);
    const hash = rawTransactionToHash(tx);
    onProgress?.("Signature received. Checking your payment…");
    await dryRunCkbTransaction(tx);
    saved = { hash, tx, quoteHash: order.quote_hash };
    localStorage.setItem(feeKey(order), JSON.stringify(saved));
  }
  if (saved.quoteHash !== order.quote_hash) throw new Error("Saved payment belongs to a different quote.");
  saved = { ...saved, tx: normalizeCkbTransaction(saved.tx) };
  checkFeeTransaction(saved.tx, order, wallet);
  if (rawTransactionToHash(saved.tx) !== saved.hash) throw new Error("Saved payment does not match its transaction hash. Reconcile it before retrying.");
  if (resuming) {
    onProgress?.("Checking your saved payment…");
    if (await ckbTransactionStatus(saved.hash) !== "unknown") return saved.hash;
  }
  onProgress?.("Submitting your signed payment…");
  const hash = await broadcastCkbTransaction(saved.tx);
  if (hash !== saved.hash) throw new Error("Broadcast hash differs from saved transaction; reconcile before retrying.");
  return hash;
}
