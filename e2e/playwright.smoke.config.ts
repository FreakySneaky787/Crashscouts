import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke tests against the production-like stack (WP 8.6, ADR 0032): Caddy with TLS, the SSR
 * server and Django under Gunicorn with production settings. Prerequisite (see e2e/README.md):
 *   docker compose -f compose.prod.yaml --env-file .env.prod --profile local up -d
 * Caddy's local CA is not trusted by the test browser, hence ignoreHTTPSErrors (local only).
 */
export const SMOKE_URL = process.env.SMOKE_URL ?? "https://localhost";
export const SMOKE_MAILPIT_URL = process.env.SMOKE_MAILPIT_URL ?? "http://127.0.0.1:18025";

export default defineConfig({
  testDir: "./smoke",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: SMOKE_URL, ignoreHTTPSErrors: true, trace: "off" },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], launchOptions: { executablePath: process.env.PW_CHROMIUM_EXECUTABLE || undefined } },
    },
  ],
});
