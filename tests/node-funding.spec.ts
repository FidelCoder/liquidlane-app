import type { CKBTransaction } from "@joyid/ckb";
import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { secp256k1 } from "@noble/curves/secp256k1";
import { bytesToHex } from "@noble/curves/abstract/utils";
import { addressToScript } from "@nervosnetwork/ckb-sdk-utils";
import { checkFunding, checkFundingTransaction, fundNode, fundingKey, fundingTransferRequest, savedFunding, startAnotherFunding, verifyFundingAddress, type SavedFunding } from "../src/marketplace/nodeFunding";
import { normalizeCkbTransaction, toRpcTransaction } from "../src/lib/ckbTransaction";
import type { ConnectedCkbWallet } from "../src/lib/ckbWallet";
import type { Node } from "../src/marketplace/types";
import fixture from "./fixtures/testnet-opening-fee.json";

const owner = fixture.order.owner;
const recipient = fixture.order.quote.fee_recipient;
function camelKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()), camelKeys(item)]));
}
const transaction = normalizeCkbTransaction(camelKeys(fixture.transaction) as CKBTransaction);
const hash = fixture.transaction.hash;
// An isolated test identity signs address reports; no real node's private key is used here.
const key = new Uint8Array(32).fill(42);
function target(changes: Record<string, unknown> = {}): Node {
  const payload = JSON.stringify({ node_id: "funding-test", chain_hash: "0x10639e0895502b5688a6be8cf69460d76541bfa4821629d86d62ba0aae3f9606", version: "0.9.0", at: Math.floor(Date.now() / 1000), funding_address: recipient, ...changes });
  return { id: "funding-test", owner, role: "provider", pubkey: bytesToHex(secp256k1.getPublicKey(key)), funding: { address: recipient, payload, signature: secp256k1.sign(createHash("sha256").update(payload).digest(), key).toCompactHex() } } as Node;
}

test("capital goes to the node's signed address, with testnet and freshness checks", async () => {
  expect(await verifyFundingAddress(target(), owner)).toBe(recipient);
  for (const changes of [{ node_id: "other-node" }, { chain_hash: "wrong-network" }, { funding_address: owner }, { version: "0.8.0" }]) {
    await expect(verifyFundingAddress(target(changes), owner)).rejects.toThrow("does not match");
  }
  await expect(verifyFundingAddress(target({ at: Math.floor(Date.now() / 1000) - 120 }), owner)).rejects.toThrow("stale");
  await expect(verifyFundingAddress(target(), recipient)).rejects.toThrow("signed-in wallet");
  const tampered = target();
  tampered.funding!.signature = "00".repeat(64);
  await expect(verifyFundingAddress(tampered, owner)).rejects.toThrow();
});

test("wallet request uses shannons and rejects invalid or self-funded transfers", () => {
  expect(fundingTransferRequest(owner, recipient, 663)).toEqual({ from: owner, to: recipient, amount: "66300000000" });
  for (const amount of [0, 60, 61.5, -61, NaN, 10_000_001]) expect(() => fundingTransferRequest(owner, recipient, amount)).toThrow();
  expect(() => fundingTransferRequest(recipient, recipient, 61)).toThrow("already this node’s funding wallet");
});

test("the actual confirmed CKB transfer passes output checks; changed destinations or amounts fail", () => {
  const request = fundingTransferRequest(owner, recipient, 61);
  expect(() => checkFundingTransaction(transaction, request)).not.toThrow();
  expect(() => checkFundingTransaction(transaction, { ...request, amount: "6200000000" })).toThrow("chosen capital");
  const altered = structuredClone(transaction);
  altered.outputs[0].lock = { ...addressToScript(owner), hashType: "type" };
  expect(() => checkFundingTransaction(altered, request)).toThrow("chosen capital");
  const extra = structuredClone(transaction);
  extra.outputs.push({ ...extra.outputs[0], lock: { ...extra.outputs[0].lock, args: `0x${"03".repeat(20)}` } });
  extra.outputsData.push("0x");
  expect(() => checkFundingTransaction(extra, request)).toThrow("Unexpected output");
  const typed = structuredClone(transaction);
  typed.outputs[0].type = typed.outputs[0].lock;
  expect(() => checkFundingTransaction(typed, request)).toThrow();
});

type Rpc = (method: string, params: unknown[]) => unknown;
async function withSaved(rpc: Rpc, work: (node: Node, wallet: ConnectedCkbWallet, storage: Map<string, string>) => Promise<void>, change?: (saved: SavedFunding) => void) {
  const oldStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage"), oldFetch = globalThis.fetch;
  const node = target({ at: Math.floor(Date.now() / 1000) - 3600 });
  const saved: SavedFunding = { node, tx: transaction, hash, amountCkb: 61 };
  change?.(saved);
  const storage = new Map([[fundingKey(node), JSON.stringify(saved)]]);
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  } });
  // Failure/recovery injection only. The historical transaction is never broadcast to CKB.
  globalThis.fetch = async (_input, init) => {
    const { method, params } = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: rpc(method, params) }));
  };
  try { await work(node, { ckbAddress: owner } as ConnectedCkbWallet, storage); }
  finally {
    globalThis.fetch = oldFetch;
    if (oldStorage) Object.defineProperty(globalThis, "localStorage", oldStorage);
    else delete (globalThis as { localStorage?: Storage }).localStorage;
  }
}
for (const status of ["pending", "proposed", "committed"]) {
  test(`saved ${status} capital is reconciled without a second wallet signature or transfer`, async () => {
    const calls: string[] = [];
    await withSaved((method, params) => {
      calls.push(method); expect(params).toEqual([hash]); return { tx_status: { status } };
    }, async (node, wallet) => expect(await fundNode(node, 1000, wallet)).toBe(hash));
    expect(calls).toEqual(["get_transaction"]);
  });
}

test("an uncertain submission reuses exactly the saved signed transaction", async () => {
  const calls: string[] = [];
  await withSaved((method, params) => {
    calls.push(method);
    if (method === "get_transaction") return null;
    expect(params).toEqual([toRpcTransaction(transaction), "passthrough"]);
    return hash;
  }, async (node, wallet) => expect(await fundNode(node, 1000, wallet)).toBe(hash));
  expect(calls).toEqual(["get_transaction", "send_transaction"]);
});

test("altered payment records and changed account ownership fail before RPC", async () => {
  const rpc = () => { throw new Error("No RPC should run"); };
  for (const change of [(saved: SavedFunding) => { saved.hash = `0x${"00".repeat(32)}`; }, (saved: SavedFunding) => { saved.amountCkb = 62; }]) {
    await withSaved(rpc, async (node, wallet) => { await expect(fundNode(node, 61, wallet)).rejects.toThrow(); }, change);
  }
  await withSaved(rpc, async (node, wallet) => { await expect(fundNode(node, 61, { ...wallet, ckbAddress: recipient })).rejects.toThrow("another node or wallet"); });
  await withSaved(rpc, async (node, _wallet, storage) => {
    storage.set(fundingKey(node), "{}");
    expect(() => savedFunding(node)).toThrow("cannot be read");
  });
});

test("only chain confirmation allows a new payment; the confirmed receipt is retained", async () => {
  let status = "pending";
  await withSaved(() => ({ tx_status: { status } }), async (node, wallet, storage) => {
    await expect(startAnotherFunding(node, wallet.ckbAddress)).rejects.toThrow("Wait for");
    expect(savedFunding(node)?.hash).toBe(hash);
    status = "committed";
    expect(await checkFunding(node, wallet.ckbAddress)).toBe("committed");
    expect(savedFunding(node)?.confirmed).toBe(true);
    await startAnotherFunding(node, wallet.ckbAddress);
    expect(savedFunding(node)).toBeNull();
    expect(JSON.parse(storage.get(`${fundingKey(node)}:receipt:${hash}`)!).hash).toBe(hash);
  });
});


test("a late confirmation cannot overwrite a newer payment record", async () => {
  let replace = () => {};
  await withSaved(() => { replace(); return { tx_status: { status: "committed" } }; }, async (node, wallet, storage) => {
    const newer = { ...savedFunding(node)!, hash: `0x${"11".repeat(32)}` };
    replace = () => storage.set(fundingKey(node), JSON.stringify(newer));
    await expect(checkFunding(node, wallet.ckbAddress)).rejects.toThrow("active capital payment changed");
    expect(savedFunding(node)?.hash).toBe(newer.hash);
    expect(savedFunding(node)?.confirmed).not.toBe(true);
  });
});
