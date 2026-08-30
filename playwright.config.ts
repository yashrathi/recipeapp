import { defineConfig, devices } from "@playwright/test";

const testPort = process.env.PORT ?? "3000";
const baseURL = `http://localhost:${testPort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  // Every browser project shares one deterministic SQLite fixture database.
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npm run db:setup && npm run dev -- -p ${testPort}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
