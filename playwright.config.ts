import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: "desktop", testMatch: /marketplace\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", testMatch: /marketplace\.spec\.ts/, use: { ...devices["Pixel 7"] } },
    { name: "settlement-desktop", testMatch: /settlement\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "settlement-mobile", testMatch: /settlement\.spec\.ts/, use: { ...devices["Pixel 7"] } },
    { name: "capital-live", testMatch: /capital-live\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "wallet-contract", testMatch: /(fee|node-funding)\.spec\.ts/ },
    { name: "onboarding-desktop", testMatch: /onboarding\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "onboarding-mobile", testMatch: /onboarding\.spec\.ts/, use: { ...devices["Pixel 7"] } },
  ],
});
