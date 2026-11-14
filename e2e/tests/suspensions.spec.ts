/**
 * WP 7.2 – Account suspensions (ADR 0027): a moderator suspends a reported person until a date;
 * the person sees a notice on every page, every write leads to the explanation, the profile is
 * hidden; one appeal, accepted by a moderator; admins see every suspension, moderators do not.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { MAILPIT_URL } from "../playwright.config";

import { createSignedInAccount, enableTotp, setRole, type MailpitSearch } from "./helpers";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test("suspend, read only, appeal, lift; the admins' list", async ({ page, request, browser }) => {
  test.setTimeout(120_000);
  const person = await createSignedInAccount(page, request);

  // Someone reports the person; a moderator opens the case.
  const reporterContext = await browser.newContext();
  const reporter = await reporterContext.newPage();
  const reporterAccount = await createSignedInAccount(reporter, request);
  await reporter.goto(`/report?type=user&username=${person.username}`);
  await reporter.getByLabel("Reason").selectOption("spam");
  await reporter.getByRole("button", { name: "Send report" }).click();
  await expect(reporter.getByText("Thank you. Moderators will review your report.")).toBeVisible();

  const modContext = await browser.newContext();
  const mod = await modContext.newPage();
  const moderator = await createSignedInAccount(mod, request);
  await enableTotp(mod, moderator.password);
  setRole(moderator.username, "moderator");
  await mod.goto("/moderation");
  await mod.getByRole("list", { name: "Open cases" }).getByRole("link", { name: `@${person.username}` }).click();
  await expect(mod).toHaveURL(/\/moderation\/user\//);

  // Suspend until a day in a week; the form needs a confirmation.
  const end = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  await mod.getByLabel("Reason").selectOption("spam");
  await mod.getByLabel("Message to the person").fill("Please stop posting advertisements.");
  await mod.getByLabel("Suspended until").fill(end);
  await mod.getByRole("button", { name: "Suspend" }).click();
  await expect(mod.getByText("Tick the box to confirm.")).toBeVisible();
  await mod.getByLabel("Message to the person").fill("Please stop posting advertisements.");
  await mod.getByLabel("Suspended until").fill(end);
  await mod.getByLabel(/Suspend this account/).check();
  await mod.getByRole("button", { name: "Suspend" }).click();
  await expect(mod).toHaveURL(/\?done=suspend$/);
  await expect(mod.getByText(`Suspended by ${moderator.username}: Spam`)).toBeVisible();
  const caseResults = await new AxeBuilder({ page: mod }).withTags(WCAG).analyze();
  expect(caseResults.violations.map((v) => v.id)).toEqual([]);

  // The person: a notice on every page; a write leads to the explanation; reading works.
  await page.goto("/discover");
  await expect(page.getByText("Your account is suspended: you can read, but not create, change or report anything.")).toBeVisible();
  await page.goto(`/report?type=user&username=${reporterAccount.username}`);
  await page.getByLabel("Reason").selectOption("spam");
  await page.getByRole("button", { name: "Send report" }).click();
  await expect(page).toHaveURL(/\/account\?suspended=1$/);
  await expect(page.getByText("This is not possible while your account is suspended.")).toBeVisible();
  const notice = page.getByRole("region", { name: "Your account is suspended" });
  await expect(notice).toContainText("Suspended: Spam");
  await expect(notice).toContainText("Please stop posting advertisements.");
  await expect(notice).toContainText("Until");
  const accountResults = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(accountResults.violations.map((v) => v.id)).toEqual([]);

  // The profile is hidden from others.
  expect((await reporter.goto(`/u/${person.username}`))?.status()).toBe(404);

  // One appeal.
  await notice.getByLabel("Appeal").fill("I posted the same link twice by mistake.");
  await notice.getByRole("button", { name: "Send appeal" }).click();
  await expect(page.getByText("Your appeal was sent. The moderators will decide.")).toBeVisible();
  await expect(page.getByText("Your appeal is waiting for the moderators' decision.")).toBeVisible();

  // A moderator who is not an admin cannot see the list of all suspensions.
  expect((await mod.goto("/moderation/suspensions"))?.status()).toBe(404);

  // The appeal reaches the queue; the moderator who suspended accepts it.
  await mod.goto("/moderation");
  await mod.getByRole("list", { name: "Appeals against suspensions" }).getByRole("link", { name: `@${person.username}` }).click();
  await expect(mod.getByText("I posted the same link twice by mistake.")).toBeVisible();
  await mod.getByRole("button", { name: "Accept appeal and lift the suspension" }).click();
  await expect(mod).toHaveURL(/\?done=suspension-accept$/);
  await page.goto("/account");
  await expect(page.getByRole("region", { name: "Your account is suspended" })).toHaveCount(0);
  await expect(page.getByText("Your account is suspended: you can read")).toHaveCount(0);
  expect((await reporter.goto(`/u/${person.username}`))?.status()).toBe(200);
  await expect
    .poll(async () => {
      const search = (await (await request.get(`${MAILPIT_URL}/api/v1/search`, { params: { query: `to:${person.email}` } })).json()) as MailpitSearch;
      return search.messages.some((m) => m.Subject.endsWith("Your appeal was decided"));
    })
    .toBe(true);

  // An admin sees every suspension with who acted.
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  const adminAccount = await createSignedInAccount(admin, request);
  await enableTotp(admin, adminAccount.password);
  setRole(adminAccount.username, "admin");
  await admin.goto("/moderation");
  await admin.getByRole("link", { name: "Suspensions" }).click();
  const row = admin.getByRole("row").filter({ hasText: `@${person.username}` });
  await expect(row).toContainText(moderator.username);
  await expect(row).toContainText("Over");
  await expect(row).toContainText("Accepted");
  const listResults = await new AxeBuilder({ page: admin }).withTags(WCAG).analyze();
  expect(listResults.violations.map((v) => v.id)).toEqual([]);

  for (const context of [reporterContext, modContext, adminContext]) await context.close();
});
