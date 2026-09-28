import { test, expect } from "@playwright/test";
import fixture from "./fixtures/testnet-opening-fee.json";

for (const confirmed of [false, true]) {
  test(`shows ${confirmed ? "confirmed" : "pending"} settlement despite a stale native state`, async ({ page }, testInfo) => {
    const closing = `0x${"ab".repeat(32)}`, settled = `0x${"cd".repeat(32)}`;
    const order = {
      ...fixture.order, fee_status: "paid", fee_tx_hash: fixture.transaction.hash,
      channel_id: `0x${"ef".repeat(32)}`, funding_outpoint: `0x${"12".repeat(32)}#0`,
      created_at: 1, updated_at: 1, delivered_at: 1, probe_received: true, error: null,
      merchant_evidence: null,
      provider_evidence: {
        state: "ShuttingDown", state_flags: "WAITING_COMMITMENT_CONFIRMATION", observed_at: 1,
        settlement_tx_hash: null,
        settlement: { confirmed, checked_at: 1, closing_tx_hash: closing,
          transaction_hashes: [closing, settled], pending_outpoints: confirmed ? [] : [`${settled}#0`] },
      },
    };
    await page.addInitScript(owner => {
      sessionStorage.setItem("liquidlane:marketplace:session", JSON.stringify({
        token: "test-session", expires_at: Math.floor(Date.now() / 1000) + 3600,
        wallet: { ckbAddress: owner },
      }));
    }, order.owner);
    await page.route("**/market/offers", route => route.fulfill({ json: { offers: [] } }));
    await page.route("**/market/dashboard", route => route.fulfill({ json: { address: order.owner, nodes: [], orders: [order], offers: [] } }));
    await page.goto("/#merchant/orders");
    const notice = page.getByRole("status", { name: "Channel settlement" });
    await expect(notice).toContainText(confirmed ? "On-chain settlement confirmed" : "Native settlement pending");
    await expect(notice.getByRole("link", { name: "Closing transaction", exact: true })).toHaveAttribute("href", `https://pudge.explorer.nervos.org/transaction/${closing}`);
    if (confirmed) await expect(notice).toContainText("Fiber still reports a pending native state");
    else await expect(notice).toContainText("Committed capacity stays reserved");
    await expect(page.getByRole("button", { name: "Export signed receipt" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Pay .* CKB fee$/ })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("settlement.png"), fullPage: true });
  });
}
