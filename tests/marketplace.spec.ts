import { test, expect } from "@playwright/test";

test("restores the service chooser and separates merchant and provider journeys", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const offers = page.waitForResponse(response => response.url().endsWith("/market/offers") && response.ok());
  await page.goto("/");
  const data = await (await offers).json();
  await expect(page.getByRole("heading", { name: /The liquidity layer/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What do you want to do?" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("landing.png"), fullPage: true });
  await page.getByRole("button", { name: "Continue as a merchant" }).click();
  await expect(page.getByText("Your role · Merchant", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  if (data.offers.length) await expect(page.locator(".offer-card")).toHaveCount(data.offers.length);
  else await expect(page.getByText("No offers published yet.")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("merchant.png"), fullPage: true });
  await page.getByRole("button", { name: "My requests", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Connect your wallet to continue" })).toBeVisible();
  await page.getByRole("button", { name: "My receiving nodes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Connect your wallet to continue" })).toBeVisible();
  await page.getByRole("button", { name: "Supply Liquidity", exact: true }).click();
  await expect(page.getByText("Your role · Liquidity provider", { exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Merchant workspace" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Connect your wallet to continue" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("provider.png"), fullPage: true });
  await page.getByRole("button", { name: "Portfolio", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Connect your wallet to continue" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("a disconnected coordinator is shown as unavailable", async ({ page }) => {
  await page.route("**/market/offers", route => route.abort());
  await page.goto("/");
  await page.getByRole("button", { name: "Continue as a merchant" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Marketplace unavailable" })).toBeVisible();
  await expect(page.getByText("No offers published yet.")).toHaveCount(0);
});
