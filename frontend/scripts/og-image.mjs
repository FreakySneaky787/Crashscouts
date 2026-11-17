/* global process, document */
// Renders public/og-image.png from scripts/og-image.html (WP 8.9). Development tool only:
//   node scripts/og-image.mjs   (needs Playwright with Chromium, e.g. from the e2e folder)
import { chromium } from "playwright";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const name = process.env.VITE_PLATFORM_NAME ?? "Crashscouts";
const browser = await chromium.launch(process.env.PW_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PW_CHROMIUM_EXECUTABLE } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(`${pathToFileURL(resolve(here, "og-image.html"))}?name=${encodeURIComponent(name)}`);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: resolve(here, "..", "public", "og-image.png") });
await browser.close();
