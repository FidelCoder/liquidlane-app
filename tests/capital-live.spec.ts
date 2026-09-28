import { test, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { addressToScript, rawTransactionToHash } from "@nervosnetwork/ckb-sdk-utils";
import type { CKBTransaction } from "@joyid/ckb";
import { LivePilot, command } from "./live-pilot";
import { checkFundingTransaction, fundingKey, fundingTransferRequest, verifyFundingAddress, type SavedFunding } from "../src/marketplace/nodeFunding";
import { normalizeCkbTransaction } from "../src/lib/ckbTransaction";
import type { Dashboard } from "../src/marketplace/types";

function camelKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()), camelKeys(item)]));
}

test("a real capital transfer confirms, updates the node balance, and supports publishing", async ({ page, baseURL }, testInfo) => {
  // Explicit opt-in: transfers 61 testnet CKB once from the specified owned test wallet.
  test.skip(process.env.LIQUIDLANE_FUNDING_TEST !== "1" || !process.env.LIQUIDLANE_FUNDING_WALLET_KEY || !process.env.LIQUIDLANE_LIVE_RECEIVER_CONFIG || !process.env.LIQUIDLANE_LIVE_PROVIDER_CONFIG, "Requires explicit funding-test opt-in and owned live testnet wallet/nodes.");
  test.setTimeout(180_000);
  const pilot = new LivePilot();
  const evidence = resolve(process.env.LIQUIDLANE_FUNDING_EVIDENCE ?? testInfo.outputDir);
  await mkdir(evidence, { recursive: true });
  try {
    await pilot.start(new URL(baseURL!).origin, process.env.LIQUIDLANE_FUNDING_WALLET_KEY);
    const before = await pilot.api<Dashboard>("/market/dashboard", pilot.providerAccount.session.token);
    const node = before.nodes[0];
    const recipient = await verifyFundingAddress(node, pilot.providerAccount.address);
    const rpcResponse = await fetch(pilot.provider.fiber_rpc, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "node_info", params: [] }) });
    const info = (await rpcResponse.json()).result;
    const script = addressToScript(recipient);
    expect({ code_hash: script.codeHash, hash_type: script.hashType, args: script.args }).toEqual(info.default_funding_lock_script);
    const request = fundingTransferRequest(pilot.providerAccount.address, recipient, 61);
    const receiptFile = join(evidence, "capital-transaction.json");
    const existing = await readFile(receiptFile, "utf8").catch(error => { if (error.code === "ENOENT") return null; throw error; });
    let originalBalance = node.available_ckb;
    if (existing) {
      const prior = JSON.parse(await readFile(join(evidence, "summary.json"), "utf8"));
      expect(prior.tx_hash).toBe(JSON.parse(existing).hash);
      expect(prior.sender).toBe(request.from); expect(prior.recipient).toBe(recipient); expect(prior.amount_ckb).toBe(61);
      originalBalance = prior.available_before_ckb;
    } else {
      // The native signer journals before broadcasting and refuses to overwrite an existing receipt.
      await command(pilot.bin("liquidlane-wallet"), ["transfer", pilot.providerAccount.key, pilot.provider.ckb_rpc, recipient, "61", receiptFile], pilot.directory);
    }
    const receipt = JSON.parse(existing ?? await readFile(receiptFile, "utf8"));
    const tx = normalizeCkbTransaction(camelKeys(receipt) as CKBTransaction);
    checkFundingTransaction(tx, request);
    expect(rawTransactionToHash(tx)).toBe(receipt.hash);
    const saved: SavedFunding = { node: { id: node.id, owner: node.owner, pubkey: node.pubkey, role: node.role, funding: node.funding }, amountCkb: 61, tx, hash: receipt.hash };
    await pilot.attach(page, "provider");
    await page.addInitScript(({ key, payment }) => localStorage.setItem(key, JSON.stringify(payment)), { key: fundingKey(node), payment: saved });
    await page.goto("/#lp");
    const capital = page.getByRole("region", { name: "Capital for Live test provider" });
    await expect(capital.getByRole("heading", { name: "61 CKB sent to your node", exact: true })).toBeVisible({ timeout: 90_000 });
    await expect(capital.getByText("Confirmed on CKB. Available capital comes from your node’s next balance report.", { exact: true })).toBeVisible();
    await expect(capital.getByRole("link", { name: "View capital transaction" })).toHaveAttribute("href", new RegExp(receipt.hash));
    await command(pilot.bin("liquidlane-connector"), ["run", pilot.providerConfig, "--once"], pilot.directory);
    await page.getByRole("button", { name: "Refresh workspace" }).click();
    const after = await pilot.api<Dashboard>("/market/dashboard", pilot.providerAccount.session.token);
    expect(after.nodes[0].available_ckb).toBe(originalBalance + 61);
    await expect(capital.locator(".capital-balance strong")).toHaveText(`${after.nodes[0].available_ckb.toLocaleString()} CKB`);
    await page.getByLabel("Minimum receive capacity · CKB", { exact: true }).fill("600");
    await page.getByRole("button", { name: "Update published offer", exact: true }).click();
    await expect(page.locator(".active-offer")).toContainText("600–1,000 CKB");
    const final = await pilot.api<Dashboard>("/market/dashboard", pilot.providerAccount.session.token);
    expect(final.offers.filter(offer => offer.enabled)).toHaveLength(1);
    expect(final.offers.find(offer => offer.enabled)?.min_capacity_ckb).toBe(600);
    await page.screenshot({ path: join(evidence, "confirmed-capital.png"), fullPage: true });
    const summary = { at: new Date().toISOString(), network: "ckb-testnet", coordinator: "isolated real API", signer: "native owned test wallet; JoyID interaction is not automated", amount_ckb: 61, sender: request.from, recipient, tx_hash: receipt.hash, status: "committed", available_before_ckb: originalBalance, available_after_ckb: after.nodes[0].available_ckb, confirmed_in_browser: true, funded_offer_minimum_ckb: 600, provider_pubkey: after.nodes[0].pubkey, signed_node_report: after.nodes[0].funding };
    await writeFile(join(evidence, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
    await capital.getByRole("button", { name: "Add more capital", exact: true }).click();
    await expect(capital.getByRole("button", { name: "Add 61 CKB to my node", exact: true })).toBeEnabled();
    await expect.poll(() => page.evaluate(key => localStorage.getItem(key), `${fundingKey(node)}:receipt:${receipt.hash}`)).not.toBeNull();
    await expect(capital.getByText("Capital payment submitted. Waiting for CKB confirmation…", { exact: true })).toHaveCount(0);
  } finally { await pilot.close(); }
});
