/**
 * WP 3B.1 – Platform roles. The first admin comes from the server command; roles need 2FA;
 * every change needs the admin's password; everyone else gets 404.
 */

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { createSignedInAccount, enableTotp, setRole } from "./helpers";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test("an admin grants the moderator role; everyone else gets 404", async ({ page, request, browser }) => {
  const admin = await createSignedInAccount(page, request);
  await enableTotp(page, admin.password);
  setRole(admin.username, "admin");

  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  const candidate = await createSignedInAccount(other, request);
  expect((await other.goto("/platform/roles"))?.status()).toBe(404);
  await other.goto("/account");
  await expect(other.getByRole("link", { name: "Platform roles" })).toHaveCount(0);

  await page.goto("/account");
  await page.getByRole("link", { name: "Platform roles" }).click();
  await expect(page).toHaveURL(/\/platform\/roles$/);
  await expect(page.getByRole("list", { name: "Current roles" })).toContainText(`${admin.username} · Admin`);

  // The candidate has no 2FA yet: refused.
  await page.getByLabel("Username").fill(candidate.username);
  await page.getByLabel("Role", { exact: true }).selectOption("moderator");
  await page.getByLabel("Your password").fill(admin.password);
  await page.getByRole("button", { name: "Save role" }).click();
  await expect(page.getByRole("alert")).toContainText("This account has to turn on two-factor authentication first.");

  await enableTotp(other, candidate.password);
  await page.getByLabel("Username").fill(candidate.username);
  await page.getByLabel("Role", { exact: true }).selectOption("moderator");
  await page.getByLabel("Your password").fill("not-the-password");
  await page.getByRole("button", { name: "Save role" }).click();
  await expect(page.getByRole("alert")).toContainText("The password is not correct.");

  await page.getByLabel("Username").fill(candidate.username);
  await page.getByLabel("Role", { exact: true }).selectOption("moderator");
  await page.getByLabel("Your password").fill(admin.password);
  await page.getByRole("button", { name: "Save role" }).click();
  await expect(page.getByText("The role was changed.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Current roles" })).toContainText(`${candidate.username} · Moderator`);
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);

  // Moderators do not manage roles.
  expect((await other.goto("/platform/roles"))?.status()).toBe(404);
  // "The last admin cannot be removed" is covered by pytest: the E2E database keeps admins of earlier runs.
  await otherContext.close();
});
