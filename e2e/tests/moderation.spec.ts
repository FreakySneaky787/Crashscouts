/**
 * WP 3B.3 – Moderation: a report reaches the queue, a moderator blocks the project, visitors get
 * 404, the team sees the reason and appeals once, the moderator accepts the appeal.
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { createProject, createSignedInAccount, enableTotp } from "./helpers";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

function setRole(username: string, role: string) {
  execFileSync("uv", ["run", "--env-file", "../.env", "python", "manage.py", "set_platform_role", username, role], {
    cwd: "../backend",
    stdio: "pipe",
  });
}

test("report, block, appeal and lift", async ({ page, request, browser }) => {
  // The team: a public project with a unique name (the E2E database keeps earlier runs).
  await createSignedInAccount(page, request);
  const slug = await createProject(page);
  const name = `Spammy ${randomBytes(3).toString("hex")}`;
  await page.goto(`/p/${slug}/edit`);
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(new RegExp(`/p/${slug}$`));

  // A tester reports it.
  const testerContext = await browser.newContext();
  const tester = await testerContext.newPage();
  await createSignedInAccount(tester, request);
  await tester.goto(`/p/${slug}`);
  await tester.getByRole("link", { name: "Report" }).click();
  await tester.getByLabel("Reason").selectOption("spam");
  await tester.getByLabel("Details (optional)").fill("Only advertising, no software.");
  await tester.getByRole("button", { name: "Send report" }).click();
  await expect(tester.getByText("Thank you. Moderators will review your report.")).toBeVisible();

  // A moderator (role from the server command, 2FA required) blocks it.
  const modContext = await browser.newContext();
  const mod = await modContext.newPage();
  const moderator = await createSignedInAccount(mod, request);
  await enableTotp(mod, moderator.password);
  setRole(moderator.username, "moderator");
  await mod.goto("/moderation");
  await expect(mod.getByRole("region", { name: "Reviews" })).toBeVisible();
  const queue = await new AxeBuilder({ page: mod }).withTags(WCAG).analyze();
  expect(queue.violations.map((v) => v.id)).toEqual([]);
  await mod.getByRole("list", { name: "Open cases" }).getByRole("link", { name }).click();
  await expect(mod.getByText("Only advertising, no software.")).toBeVisible();
  const results = await new AxeBuilder({ page: mod }).withTags(WCAG).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
  await mod.getByLabel("Reason", { exact: true }).selectOption("spam");
  await mod.getByLabel("Message to the team").fill("The project page contains only advertising.");
  await mod.getByRole("button", { name: "Block", exact: true }).click();
  await expect(mod.getByRole("alert")).toContainText("Tick the box to confirm.");
  await mod.getByLabel(/Block this content for everyone outside the team/).check();
  await mod.getByRole("button", { name: "Block", exact: true }).click();
  await expect(mod.getByText("Done.")).toBeVisible();

  // Gone for everyone outside the team.
  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  expect((await visitor.goto(`/p/${slug}`))?.status()).toBe(404);
  expect((await tester.goto(`/p/${slug}`))?.status()).toBe(404);
  await tester.goto("/account");
  await expect(tester.getByRole("list", { name: "Your reports" })).toContainText("Resolved");

  // The team sees the reason and appeals once.
  await page.goto(`/p/${slug}`);
  await expect(page.getByText("The project page contains only advertising.")).toBeVisible();
  await page.getByLabel("Appeal").fill("We added the download links; it is real software.");
  await page.getByRole("button", { name: "Send appeal" }).click();
  await expect(page.getByText("Your appeal was sent. The moderators will decide.")).toBeVisible();
  await expect(page.getByText("Your appeal is waiting for the moderators' decision.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send appeal" })).toHaveCount(0);

  // The moderator accepts the appeal; the project is back.
  await mod.goto("/moderation");
  await mod.getByRole("list", { name: "Appeals" }).getByRole("link", { name }).click();
  await mod.getByRole("button", { name: "Accept appeal and lift the block" }).click();
  await expect(mod.getByText("Done.")).toBeVisible();
  expect((await visitor.goto(`/p/${slug}`))?.status()).toBe(200);

  // Moderation pages are 404 for everyone else.
  expect((await tester.goto("/moderation"))?.status()).toBe(404);
  for (const context of [testerContext, modContext, visitorContext]) await context.close();
});
