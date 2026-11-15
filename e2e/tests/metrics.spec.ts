/**
 * WP M.1 – Growth metrics (ADR 0030): admins only; opened from the account page; five key
 * figures, monthly and cohort tables; no WCAG A/AA violations in light and dark; no sideways
 * scrolling on narrow screens.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Browser } from "@playwright/test";

import { createSignedInAccount, enableTotp, setRole } from "./helpers";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function withRole(browser: Browser, request: APIRequestContext, role: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const account = await createSignedInAccount(page, request);
  await enableTotp(page, account.password);
  setRole(account.username, role);
  return { context, page };
}

test("growth metrics for admins only, accessible in light and dark", async ({ request, browser }) => {
  test.setTimeout(60_000);
  const mod = await withRole(browser, request, "moderator");
  expect((await mod.page.goto("/platform/metrics"))?.status()).toBe(404);
  await mod.page.goto("/account");
  await expect(mod.page.getByRole("link", { name: "Growth metrics" })).toHaveCount(0);

  const admin = await withRole(browser, request, "admin");
  const page = admin.page;
  await page.goto("/account");
  await page.getByRole("link", { name: "Growth metrics" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Growth metrics" })).toBeVisible();
  for (const name of ["Time to first tester", "Completion rate", "Useful feedback rate", "Returning testers", "Returning developers"]) {
    await expect(page.getByRole("term").filter({ hasText: name }).first()).toBeVisible();
  }
  await expect(page.getByRole("region", { name: "Per month of publication" }).getByRole("row")).toHaveCount(13);
  await expect(page.getByRole("region", { name: "Returning people per cohort" }).getByRole("row")).toHaveCount(13);
  const light = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(light.violations.map((v) => v.id)).toEqual([]);
  await page.getByRole("button", { name: "Dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Dark theme" })).toHaveAttribute("aria-pressed", "true");
  const dark = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(dark.violations.map((v) => v.id)).toEqual([]);
  await page.setViewportSize({ width: 390, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const context of [mod.context, admin.context]) await context.close();
});
