import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-End-Tests gegen den echten Stack: Django (dev-Settings, PostgreSQL 18) und den
 * PRODUKTIONS-Build des SSR-Frontends (react-router-serve). Voraussetzung: `docker compose up -d db`.
 */
export const FRONTEND_URL = "http://127.0.0.1:3000";
export const BACKEND_URL = "http://127.0.0.1:8000";

// Optional: vorinstallierter Chromium (z. B. Cloud-Umgebung), sonst der von Playwright installierte.
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
      env: { ...process.env, DJANGO_CSRF_TRUSTED_ORIGINS: FRONTEND_URL } as Record<string, string>,
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
