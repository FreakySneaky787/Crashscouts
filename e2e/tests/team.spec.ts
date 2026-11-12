/**
 * WP 2.3 – project team: invitation by username with email, accept on the account page, private
 * project visible only after accepting, removal, leaving and ownership handover.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Browser } from "@playwright/test";

import { FRONTEND_URL, MAILPIT_URL } from "../playwright.config";

import { createProject, createSignedInAccount, type MailpitSearch } from "./helpers";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function secondUser(browser: Browser, request: APIRequestContext) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const account = await createSignedInAccount(page, request);
  return { context, page, account };
}

test("invite, accept, and then see the private project", async ({ page, request, browser }) => {
  await createSignedInAccount(page, request);
  const slug = await createProject(page, { visibility: "private" });
  const invitee = await secondUser(browser, request);

  expect((await invitee.page.goto(`/p/${slug}`))?.status()).toBe(404);

  await page.goto(`/p/${slug}/team`);
  await page.getByLabel("Username").fill(invitee.account.username);
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByRole("status")).toContainText("Invitation sent.");
  await expect(page.getByRole("list", { name: "Pending invitations" })).toContainText(invitee.account.username);
  await expect
    .poll(async () => {
      const search = (await (await request.get(`${MAILPIT_URL}/api/v1/search`, { params: { query: `to:${invitee.account.email}` } })).json()) as MailpitSearch;
      return search.messages.map((m) => m.Subject).join(" | ");
    })
    .toContain("invited you to Tidewater Sync");

  await invitee.page.goto("/account");
  await invitee.page.getByRole("button", { name: "Accept" }).click();
  await expect(invitee.page.getByRole("status").first()).toContainText("You joined the project.");
  await invitee.page.goto(`/p/${slug}`);
  await expect(invitee.page.getByRole("heading", { level: 1, name: "Tidewater Sync" })).toBeVisible();
  await expect(invitee.page.getByRole("link", { name: "Edit" })).toBeVisible();
  await invitee.context.close();
});

test("errors for unknown usernames; strangers cannot reach the team page", async ({ page, request, browser }) => {
  await createSignedInAccount(page, request);
  const slug = await createProject(page);
  await page.goto(`/p/${slug}/team`);
  await page.getByLabel("Username").fill("nobody-with-this-name");
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByRole("alert")).toContainText("No account with this username can be invited.");

  const stranger = await secondUser(browser, request);
  expect((await stranger.page.goto(`/p/${slug}/team`))?.status()).toBe(404);
  await stranger.context.close();
});

test("hand over, then the former owner leaves", async ({ page, request, browser }) => {
  const owner = await createSignedInAccount(page, request);
  const slug = await createProject(page);
  const other = await secondUser(browser, request);

  await page.goto(`/p/${slug}/team`);
  await page.getByLabel("Username").fill(other.account.username);
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByRole("status")).toContainText("Invitation sent.");
  await other.page.goto("/account");
  await other.page.getByRole("button", { name: "Accept" }).click();
  await expect(other.page.getByRole("status").first()).toContainText("You joined the project.");

  await page.goto(`/p/${slug}/team`);
  await page.getByLabel("New owner").selectOption(other.account.username);
  await page.locator("#transfer-password").fill("wrong-password");
  await page.getByRole("button", { name: "Hand over" }).click();
  await expect(page.getByRole("alert")).toContainText("The password is incorrect.");
  await page.locator("#transfer-password").fill(owner.password);
  await page.getByRole("button", { name: "Hand over" }).click();
  await expect(page.getByRole("status")).toContainText("The project was handed over.");

  // Now a maintainer: the former owner leaves the project.
  await page.getByRole("button", { name: "Leave project" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await other.page.goto(`/p/${slug}/team`);
  await expect(other.page.getByRole("list", { name: "Members" })).not.toContainText(owner.username);
  await other.context.close();
});

test("team and invitation pages have no WCAG A/AA violations", async ({ page, request, browser, context }) => {
  await createSignedInAccount(page, request);
  const slug = await createProject(page);
  const invitee = await secondUser(browser, request);
  await page.goto(`/p/${slug}/team`);
  await page.getByLabel("Username").fill(invitee.account.username);
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByRole("status")).toContainText("Invitation sent.");
  for (const theme of ["light", "dark"]) {
    await context.addCookies([{ name: "theme", value: theme, url: FRONTEND_URL }]);
    await invitee.context.addCookies([{ name: "theme", value: theme, url: FRONTEND_URL }]);
    await page.goto(`/p/${slug}/team`);
    expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations.map((v) => `${theme} team: ${v.id}`)).toEqual([]);
    await invitee.page.goto("/account");
    expect((await new AxeBuilder({ page: invitee.page }).withTags(WCAG).analyze()).violations.map((v) => `${theme} account: ${v.id}`)).toEqual([]);
  }
  await invitee.context.close();
});
