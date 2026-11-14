/**
 * WP 7.1 – Reporting a person (ADR 0026): from the public profile, with the reasons for people;
 * never oneself; the moderator sees the case without a block form and warns the person by mail.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { MAILPIT_URL } from "../playwright.config";

import { createSignedInAccount, enableTotp, setRole, type MailpitSearch } from "./helpers";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test("a person is reported from the profile and warned by a moderator", async ({ page, request, browser }) => {
  test.setTimeout(90_000);
  const person = await createSignedInAccount(page, request);
  await page.goto(`/u/${person.username}`);
  await expect(page.getByRole("link", { name: "Report" })).toHaveCount(0); // not oneself

  const reporterContext = await browser.newContext();
  const reporter = await reporterContext.newPage();
  await createSignedInAccount(reporter, request);
  await reporter.goto(`/u/${person.username}`);
  await reporter.getByRole("link", { name: "Report" }).click();
  await expect(reporter.getByText(`Person: @${person.username}`)).toBeVisible();
  const reasons = reporter.getByLabel("Reason").locator("option");
  await expect(reasons).toHaveText(["Spam", "Harassment or insults", "Pretending to be someone else", "Inappropriate profile", "Other"]);
  const results = await new AxeBuilder({ page: reporter }).withTags(WCAG).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
  await reporter.getByLabel("Reason").selectOption("impersonation");
  await reporter.getByLabel("Details (optional)").fill("Uses the name of a well-known maintainer.");
  await reporter.getByRole("button", { name: "Send report" }).click();
  await expect(reporter).toHaveURL(new RegExp(`/u/${person.username}\\?reported=1$`));
  await expect(reporter.getByText("Thank you. Moderators will review your report.")).toBeVisible();

  // The moderator: the case has no block form (people are suspended, WP 7.2), only a warning.
  const modContext = await browser.newContext();
  const mod = await modContext.newPage();
  const moderator = await createSignedInAccount(mod, request);
  await enableTotp(mod, moderator.password);
  setRole(moderator.username, "moderator");
  await mod.goto("/moderation");
  await mod.getByRole("list", { name: "Open cases" }).getByRole("link", { name: `@${person.username}` }).click();
  await expect(mod.getByText("Pretending to be someone else")).toBeVisible();
  await expect(mod.getByRole("link", { name: "Open the profile" })).toHaveAttribute("href", `/u/${person.username}`);
  await expect(mod.getByRole("button", { name: "Block" })).toHaveCount(0);
  const caseResults = await new AxeBuilder({ page: mod }).withTags(WCAG).analyze();
  expect(caseResults.violations.map((v) => v.id)).toEqual([]);
  await mod.getByLabel("Warning to the person").fill("Please choose a name that is your own.");
  await mod.getByRole("button", { name: "Send warning" }).click();
  await expect(mod.getByText("Done.")).toBeVisible();
  await expect(mod.getByText("Warning: Please choose a name that is your own.")).toBeVisible();
  // The person got the warning by mail.
  await expect
    .poll(async () => {
      const search = (await (await request.get(`${MAILPIT_URL}/api/v1/search`, { params: { query: `to:${person.email}` } })).json()) as MailpitSearch;
      const newest = search.messages[0];
      if (!newest) return "";
      return ((await (await request.get(`${MAILPIT_URL}/api/v1/message/${newest.ID}`)).json()) as { Text: string }).Text;
    })
    .toContain("Please choose a name that is your own.");

  for (const context of [reporterContext, modContext]) await context.close();
});
