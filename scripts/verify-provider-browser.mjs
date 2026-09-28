// Used by Core's isolated, unfunded service check. The API and signatures are real;
// the account uses the native test wallet. No JoyID passkey or transfer is performed.
import { chromium, expect } from "@playwright/test";
let text = "";
for await (const chunk of process.stdin) text += chunk;
const input = JSON.parse(text);
await expect.poll(async () => {
  return fetch(input.appURL, { signal: AbortSignal.timeout(2000) }).then(r => r.ok).catch(() => false);
}, { timeout: 60_000 }).toBe(true);
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_PATH
  ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {});
try {
  for (const width of [1280, 393]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route(/\/market\//, async route => {
      const url = new URL(route.request().url());
      const response = await route.fetch({ url: input.coreURL + url.pathname + url.search });
      await route.fulfill({ response });
    });
    await page.addInitScript(({ session, owner }) => {
      sessionStorage.setItem("liquidlane:marketplace:session", JSON.stringify({
        ...session, wallet: { ckbAddress: owner },
      }));
    }, input);
    await page.goto(input.appURL + "/#lp");
    await expect(page.getByText("Running automatically", { exact: true })).toBeVisible();
    const capital = page.getByRole("region", { name: "Capital for Isolated service check" });
    await expect(capital.getByRole("heading", { name: "Fund your node" })).toBeVisible();
    await expect(capital.getByLabel("Node’s CKB funding address")).toHaveValue(input.address);
    await expect(capital.locator(".capital-balance strong")).toHaveText("0 CKB");
    await expect(capital.getByRole("button", { name: /^Add [\d,]+ CKB to my node$/ })).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await page.screenshot({ path: input.screenshot.replace(/\.png$/, `-${width}.png`), fullPage: true });
    await page.close();
  }
  console.log(JSON.stringify({ desktop: true, mobile: true, node_signature_verified: true, transfer_requested: false }));
} finally { await browser.close(); }
