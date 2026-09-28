import { test, expect } from "@playwright/test";
import { feeTransferRequest } from "../src/marketplace/fee";
import type { CKBTransaction } from "@joyid/ckb";
import { rawTransactionToHash, serializeTransaction } from "@nervosnetwork/ckb-sdk-utils";
import { normalizeCkbTransaction, toRpcTransaction } from "../src/lib/ckbTransaction";
import { ckbTransactionStatus, type ConnectedCkbWallet } from "../src/lib/ckbWallet";
import { payFee } from "../src/marketplace/wallet";
import type { Order } from "../src/marketplace/types";
import fixture from "./fixtures/testnet-opening-fee.json";

test("JoyID receives the quoted fee in shannons with the accepted parties", () => {
  const owner = "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqvjp0wktpqeh8cz54uk867rl93xfyerdagpaf7ae";
  const provider = "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqthj2jju7mskjqvaqhgxmuy06q8jp5fyxqnefz3j";
  const order = { owner, quote: { fee_recipient: provider, opening_fee_ckb: 61 } };
  expect(feeTransferRequest(order)).toEqual({ from: owner, to: provider, amount: "6100000000" });
  for (const invalid of [0, -1, 61.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
    expect(() => feeTransferRequest({ ...order, quote: { ...order.quote, opening_fee_ckb: invalid } })).toThrow("Invalid quoted opening fee");
  }
});

function camelKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()), camelKeys(item)]));
}
// Preserve RPC enum values, as in the JoyID response that triggered this failure.
const walletTransaction = camelKeys(fixture.transaction) as CKBTransaction;
const { hash: confirmedHash, ...confirmedRpcTransaction } = fixture.transaction;

test("wallet enum conversion preserves the confirmed transaction hash, outputs, and witnesses", () => {
  const original = JSON.stringify(walletTransaction);
  const tx = normalizeCkbTransaction(walletTransaction);
  expect(rawTransactionToHash(tx)).toBe(confirmedHash);
  expect(toRpcTransaction(tx)).toEqual(confirmedRpcTransaction);
  expect(toRpcTransaction(walletTransaction)).toEqual(confirmedRpcTransaction);
  expect(tx.witnesses).toEqual(fixture.transaction.witnesses);
  expect(JSON.stringify(walletTransaction)).toBe(original);
  expect(serializeTransaction(normalizeCkbTransaction(tx))).toBe(serializeTransaction(tx));
});

test("unknown dependency types are rejected before a transaction can be submitted", () => {
  const tx = { ...walletTransaction, cellDeps: [{ ...walletTransaction.cellDeps[0], depType: "unknown" }] } as unknown as CKBTransaction;
  expect(() => normalizeCkbTransaction(tx)).toThrow("unsupported transaction dependency type");
  expect(() => toRpcTransaction(tx)).toThrow("unsupported transaction dependency type");
});

type Rpc = (method: string, params: unknown[]) => unknown;
async function withSavedPayment(rpc: Rpc, work: (order: Order, wallet: ConnectedCkbWallet) => Promise<void>, hash = confirmedHash) {
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const previousFetch = globalThis.fetch;
  const order = { ...fixture.order, fee_status: "due" } as Order;
  const key = `liquidlane:fee:${order.owner}:${order.id}`;
  const storage = new Map([[key, JSON.stringify({ hash, tx: walletTransaction, quoteHash: order.quote_hash })]]);
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  } });
  // Fault injection only: these tests never send the historical transaction to a node.
  globalThis.fetch = async (_input, init) => {
    const { method, params } = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: rpc(method, params) }));
  };
  try { await work(order, { ckbAddress: order.owner } as ConnectedCkbWallet); }
  finally {
    globalThis.fetch = previousFetch;
    if (previousStorage) Object.defineProperty(globalThis, "localStorage", previousStorage);
    else delete (globalThis as { localStorage?: Storage }).localStorage;
  }
}

for (const status of ["pending", "proposed", "committed"] as const) {
  test(`a saved ${status} payment is reconciled without signing or broadcasting again`, async () => {
    const calls: string[] = [];
    await withSavedPayment((method, params) => {
      calls.push(method);
      expect(method).toBe("get_transaction");
      expect(params).toEqual([confirmedHash]);
      return { tx_status: { status } };
    }, async (order, wallet) => expect(await payFee(order, wallet)).toBe(confirmedHash));
    expect(calls).toEqual(["get_transaction"]);
  });
}

test("retrying an unsubmitted payment reuses the exact saved signed transaction", async () => {
  const calls: string[] = [];
  await withSavedPayment((method, params) => {
    calls.push(method);
    if (method === "get_transaction") return null;
    expect(method).toBe("send_transaction");
    expect(params).toEqual([confirmedRpcTransaction, "passthrough"]);
    return confirmedHash;
  }, async (order, wallet) => expect(await payFee(order, wallet)).toBe(confirmedHash));
  expect(calls).toEqual(["get_transaction", "send_transaction"]);
});

test("a mismatched saved hash is rejected before any RPC call", async () => {
  const calls: string[] = [];
  await withSavedPayment(method => { calls.push(method); return null; }, async (order, wallet) => {
    await expect(payFee(order, wallet)).rejects.toThrow("does not match its transaction hash");
  }, `0x${"00".repeat(32)}`);
  expect(calls).toEqual([]);
});

test("confirmation distinguishes missing transactions from rejected payments", async () => {
  await withSavedPayment(() => null, async () => expect(await ckbTransactionStatus(confirmedHash)).toBe("unknown"));
  await withSavedPayment(() => ({ tx_status: { status: "rejected", reason: "dead input" } }), async () => {
    await expect(ckbTransactionStatus(confirmedHash)).rejects.toThrow("saved payment was rejected");
  });
});
