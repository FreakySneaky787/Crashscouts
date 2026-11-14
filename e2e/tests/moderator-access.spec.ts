/**
 * WP 7.3 – Several moderators and purpose-bound access (ADR 0028): the case shows who took it;
 * the content opens only for the moderator who took the case, with a reason, read only, for 24
 * hours; another moderator gets 404 for that access; admins see every access with its reason.
 */
import { randomBytes } from "node:crypto";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type APIRequestContext } from "@playwright/test";

import { createProject, createSignedInAccount, enableTotp, setRole } from "./helpers";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function signedInWithRole(browser: Browser, request: APIRequestContext, role: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const account = await createSignedInAccount(page, request);
  await enableTotp(page, account.password);
  setRole(account.username, role);
  return { context, page, account };
}

test("take a case, open its content with a reason, the admins' list", async ({ page, request, browser }) => {
  test.setTimeout(120_000);
  await createSignedInAccount(page, request);
  const slug = await createProject(page);
  const name = `Lookalike ${randomBytes(3).toString("hex")}`; // unique: the E2E database keeps earlier runs
  await page.goto(`/p/${slug}/edit`);
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(new RegExp(`/p/${slug}$`));

  const reporterContext = await browser.newContext();
  const reporter = await reporterContext.newPage();
  await createSignedInAccount(reporter, request);
  await reporter.goto(`/p/${slug}`);
  await reporter.getByRole("link", { name: "Report" }).click();
  await reporter.getByLabel("Reason").selectOption("deception");
  await reporter.getByRole("button", { name: "Send report" }).click();
  await expect(reporter.getByText("Thank you. Moderators will review your report.")).toBeVisible();

  // The first moderator: the content opens only after taking the case.
  const first = await signedInWithRole(browser, request, "moderator");
  const mod = first.page;
  await mod.goto("/moderation");
  await mod.getByRole("list", { name: "Open cases" }).getByRole("link", { name, exact: true }).click();
  await expect(mod).toHaveURL(/\/moderation\/project\//);
  const caseUrl = new URL(mod.url()).pathname;
  await expect(mod.getByText("Take the case first to open its content.")).toBeVisible();
  await mod.getByRole("button", { name: "Take the case (mark as in review)" }).click();
  await expect(mod).toHaveURL(/\?done=take$/);
  await expect(mod.getByText(`in review by ${first.account.username}`)).toBeVisible();
  await mod.getByLabel("Purpose of the access").fill("Deception report: compare the description with the repository.");
  await mod.getByRole("button", { name: "Open the content for 24 hours" }).click();
  await expect(mod.getByText(/Your access is open until/)).toBeVisible();
  await mod.getByRole("link", { name: "View the content" }).click();
  await expect(mod.getByRole("heading", { level: 1, name: "Reported content" })).toBeVisible();
  await expect(mod.getByText("Your purpose: Deception report: compare the description with the repository.")).toBeVisible();
  await expect(mod.getByText(name, { exact: true }).first()).toBeVisible();
  const accessUrl = new URL(mod.url()).pathname;
  const results = await new AxeBuilder({ page: mod }).withTags(WCAG).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);

  // A second moderator sees who took the case, has no access, and cannot use the first one's.
  const second = await signedInWithRole(browser, request, "moderator");
  await second.page.goto(caseUrl);
  await expect(second.page.getByText(`in review by ${first.account.username}`)).toBeVisible();
  await expect(second.page.getByText("Take the case first to open its content.")).toBeVisible();
  expect((await second.page.goto(accessUrl))?.status()).toBe(404);
  expect((await reporter.goto(accessUrl))?.status()).toBe(404);

  // Admins see every access with moderator, reason and views; moderators do not.
  expect((await mod.goto("/moderation/accesses"))?.status()).toBe(404);
  const admin = await signedInWithRole(browser, request, "admin");
  await admin.page.goto("/moderation");
  await admin.page.getByRole("link", { name: "Moderator accesses" }).click();
  const row = admin.page.getByRole("row").filter({ hasText: first.account.username });
  await expect(row).toContainText("Deception report: compare the description with the repository.");
  await expect(row).toContainText("Open");
  const listResults = await new AxeBuilder({ page: admin.page }).withTags(WCAG).analyze();
  expect(listResults.violations.map((v) => v.id)).toEqual([]);

  for (const context of [reporterContext, first.context, second.context, admin.context]) await context.close();
});

test("WP 7.4: moderation statistics for admins only, accessible, no sideways scrolling", async ({ request, browser }) => {
  test.setTimeout(60_000);
  const mod = await signedInWithRole(browser, request, "moderator");
  expect((await mod.page.goto("/moderation/statistics"))?.status()).toBe(404);
  const admin = await signedInWithRole(browser, request, "admin");
  await admin.page.goto("/moderation");
  await admin.page.getByRole("link", { name: "Moderation statistics" }).click();
  await expect(admin.page.getByRole("heading", { level: 1, name: "Moderation statistics" })).toBeVisible();
  await expect(admin.page.getByText("open reports")).toBeVisible();
  const perMonth = admin.page.getByRole("region", { name: "Per month" }).getByRole("table");
  await expect(perMonth.getByRole("row")).toHaveCount(13); // header and 12 months
  const results = await new AxeBuilder({ page: admin.page }).withTags(WCAG).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
  await admin.page.setViewportSize({ width: 390, height: 800 });
  expect(await admin.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const context of [mod.context, admin.context]) await context.close();
});
