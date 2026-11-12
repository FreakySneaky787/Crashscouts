import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against the real stack: Django (dev settings, PostgreSQL 18) and the PRODUCTION
 * build of the SSR frontend (react-router-serve). Prerequisite: `docker compose up -d db mailpit`.
 */
// "localhost", not 127.0.0.1: passkeys (WebAuthn) reject IP addresses as relying party.
export const FRONTEND_URL = "http://localhost:3000";
export const BACKEND_URL = "http://127.0.0.1:8000";
// Local mail catcher (compose service "mailpit"); account emails are read from its API.
export const MAILPIT_URL = "http://127.0.0.1:8025";

// Optional: a preinstalled Chromium (e.g. cloud environment), otherwise the one Playwright installs.
const executablePath = process.env.PW_CHROMIUM_EXECUTABLE || undefined;

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./global-setup.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: FRONTEND_URL,
    trace: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], launchOptions: { executablePath } },
    },
  ],
  webServer: [
    {
      command: "uv run --env-file ../.env python manage.py runserver 127.0.0.1:8000 --noreload",
      cwd: "../backend",
      url: `${BACKEND_URL}/api/v1/health/`,
      env: {
        ...process.env,
        DJANGO_CSRF_TRUSTED_ORIGINS: FRONTEND_URL,
        FRONTEND_URL,
        DJANGO_SIGNUP_ENABLED: "true",
      } as Record<string, string>,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "pnpm build && pnpm start",
      cwd: "../frontend",
      url: FRONTEND_URL,
      env: {
        ...process.env,
        HOST: "127.0.0.1",
        PORT: "3000",
        BACKEND_INTERNAL_URL: BACKEND_URL,
        NODE_ENV: "production",
      } as Record<string, string>,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
