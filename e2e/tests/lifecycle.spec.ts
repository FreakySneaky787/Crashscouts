/**
 * WP 1.5 – personal data export and account deletion with a 14-day grace period.
 */
import { readFile } from "node:fs/promises";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext } from "@playwright/test";

import { FRONTEND_URL, MAILPIT_URL } from "../playwright.config";

import { createSignedInAccount, logIn, type MailpitSearch } from "./helpers";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function subjectsFor(request: APIRequestContext, to: string): Promise<string[]> {
  const search = (await (await request.get(`${MAILPIT_URL}/api/v1/search`, { params: { query: `to:${to}` } })).json()) as MailpitSearch;
  return search.messages.map((m) => m.Subject);
}

test("download your data: password needed, file contains own data and no password", async ({ page, request }) => {
  const account = await createSignedInAccount(page, request);
  await page.getByRole("link", { name: "Data and account" }).click();
  await expect(page).toHaveURL(/\/settings\/account$/);

  await page.locator("#export-password").fill("wrong-password");
  await page.getByRole("button", { name: "Download data" }).click();
  await expect(page.getByRole("alert")).toContainText("The password is incorrect.");

  await page.locator("#export-password").fill(account.password);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download data" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^personal-data-\d{4}-\d{2}-\d{2}\.json$/);
  const text = await readFile((await download.path())!, "utf-8");
  const data = JSON.parse(text);
  expect(data.account.username).toBe(account.username);
  expect(data.account.email).toBe(account.email);
  expect(text).not.toContain(account.password);
});

test("delete the account, then cancel it by signing in again", async ({ page, request, browser }) => {
  const account = await createSignedInAccount(page, request);
  await page.goto("/settings/account");

  await page.locator("#delete-password").fill("wrong-password");
  await page.getByLabel("I understand that my account will be deleted after 14 days.").check();
  await page.getByRole("button", { name: "Delete account" }).click();
  await expect(page.getByRole("alert")).toContainText("The password is incorrect.");

  await page.locator("#delete-password").fill(account.password);
  await page.getByLabel("I understand that my account will be deleted after 14 days.").check();
  await page.getByRole("button", { name: "Delete account" }).click();
  await expect(page).toHaveURL(/\/goodbye$/);
  await expect(page.getByRole("status")).toContainText("Your account will be deleted in 14 days.");

  // Signed out and invisible.
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login/);
  expect((await request.get(`/u/${account.username}`)).status()).toBe(404);
  await expect.poll(() => subjectsFor(request, account.email)).toContainEqual(expect.stringContaining("Your account will be deleted"));

  // Signing in within the grace period cancels the deletion.
  const context = await browser.newContext();
  const again = await context.newPage();
  await again.goto("/login");
  await logIn(again, account.email, account.password);
  await expect(again).toHaveURL(/\/account$/);
  expect((await request.get(`/u/${account.username}`)).status()).toBe(200);
  await expect.poll(() => subjectsFor(request, account.email)).toContainEqual(expect.stringContaining("deletion was cancelled"));
  await context.close();
});

test("account settings need a login", async ({ page, request }) => {
  await page.goto("/settings/account");
  await expect(page).toHaveURL(/\/login\?next=/);
  const response = await request.post("/account/export", { form: { password: "x" }, maxRedirects: 0 });
  expect(response.headers()["content-type"] ?? "").not.toContain("application/json");
});

test("account pages have no WCAG A/AA violations in light and dark", async ({ page, request, context }) => {
  await createSignedInAccount(page, request);
  for (const theme of ["light", "dark"]) {
    await context.addCookies([{ name: "theme", value: theme, url: FRONTEND_URL }]);
    for (const path of ["/settings/account", "/goodbye"]) {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
      expect(results.violations.map((v) => `${theme} ${path}: ${v.id}`)).toEqual([]);
    }
  }
});
