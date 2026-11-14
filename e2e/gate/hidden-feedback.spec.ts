/**
 * WP 7.1 – Reporting published feedback (ADR 0026), in the security-gate run because it needs a
 * public campaign: a signed-in reader reports it, a moderator hides it (it becomes private, the
 * team and the author see the reason, only the team may appeal) and shows it again.
 */
import { randomBytes } from "node:crypto";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { createSignedInAccount } from "../tests/helpers";

import { publishedFeedbackScene } from "./helpers";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test("published feedback is reported, hidden with a reason and shown again", async ({ page, request, browser }) => {
  test.setTimeout(120_000);
  const title = `Cheap licences ${randomBytes(3).toString("hex")}`;
  const { feedback, tester, mod, contexts } = await publishedFeedbackScene(page, browser, request, title);

  // The author and the team cannot report it; a signed-in reader can, with feedback reasons only.
  await expect(tester.getByRole("link", { name: "Report" })).toHaveCount(0);
  await page.goto(feedback);
  await expect(page.getByRole("link", { name: "Report" })).toHaveCount(0);
  const readerContext = await browser.newContext();
  const reader = await readerContext.newPage();
  await createSignedInAccount(reader, request);
  await reader.goto(feedback);
  await reader.getByRole("link", { name: "Report" }).click();
  await expect(reader.getByText(`Feedback: ${title}`)).toBeVisible();
  await expect(reader.getByLabel("Reason").locator("option", { hasText: "Malware" })).toHaveCount(0);
  const form = await new AxeBuilder({ page: reader }).withTags(WCAG).analyze();
  expect(form.violations.map((v) => v.id)).toEqual([]);
  await reader.getByLabel("Reason").selectOption("spam");
  await reader.getByRole("button", { name: "Send report" }).click();
  await expect(reader).toHaveURL(new RegExp(`${feedback}\\?reported=1$`));
  await expect(reader.getByText("Thank you. Moderators will review your report.")).toBeVisible();

  // The moderator hides it with a message.
  await mod.goto("/moderation");
  await mod.getByRole("list", { name: "Open cases" }).getByRole("link", { name: title }).click();
  await expect(mod.getByText("Feedback ·", { exact: false })).toBeVisible();
  await mod.getByLabel("Reason").selectOption("spam");
  await mod.getByLabel("Message to the team").fill("Advertising is not feedback.");
  await mod.getByLabel(/Hide this feedback/).check();
  await mod.getByRole("button", { name: "Hide", exact: true }).click();
  await expect(mod.getByText("Done.")).toBeVisible();
  const caseUrl = new URL(mod.url()).pathname; // without "?done=block"

  // Hidden: 404 for the reader; the author sees the reason, the team can appeal.
  expect((await reader.goto(feedback))?.status()).toBe(404);
  await tester.goto(feedback);
  await expect(tester.getByText("Hidden: Spam")).toBeVisible();
  await expect(tester.getByText("Advertising is not feedback.")).toBeVisible();
  await expect(tester.getByText("The project team can appeal once.")).toBeVisible();
  await expect(tester.getByRole("button", { name: "Send appeal" })).toHaveCount(0);
  const hidden = await new AxeBuilder({ page: tester }).withTags(WCAG).analyze();
  expect(hidden.violations.map((v) => v.id)).toEqual([]);
  await page.goto(feedback);
  await expect(page.getByRole("button", { name: "Propose to make it public" })).toHaveCount(0);
  await page.getByLabel("Appeal").fill("The tester meant it as a joke; we will talk to them.");
  await page.getByRole("button", { name: "Send appeal" }).click();
  await expect(page.getByText("Your appeal was sent. The moderators will decide.")).toBeVisible();

  // The moderator accepts the appeal: the feedback is shown to the participants again, but stays
  // private until the team and the author publish it again.
  await mod.goto(caseUrl);
  await mod.getByRole("button", { name: "Accept appeal and lift the block" }).click();
  await expect(mod).toHaveURL(/\?done=appeal-lift$/);
  await expect(mod.getByText("Done.")).toBeVisible();
  await page.goto(feedback);
  await expect(page.getByText("Hidden: Spam")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Propose to make it public" })).toBeVisible();
  expect((await reader.goto(feedback))?.status()).toBe(404);

  for (const context of [...contexts, readerContext]) await context.close();
});
