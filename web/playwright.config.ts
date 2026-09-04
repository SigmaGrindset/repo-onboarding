import { defineConfig, devices } from "@playwright/test";

// The suite owns its server. 3100 is the default, but it is a shared port on
// some machines, so E2E_PORT lets a run move off it without editing config.
const PORT = Number(process.env.E2E_PORT ?? 3100);
const ORIGIN = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: ORIGIN,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 5"], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: {
    // Keep feature-gated UI stable even when a developer/CI has no local env.
    command: `cross-env APP_MODE=local NEXT_DIST_DIR=.next-local AI_GATEWAY_API_KEY=e2e-placeholder next start -p ${PORT}`,
    url: ORIGIN,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
