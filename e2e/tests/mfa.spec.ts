/**
 * WP 1.3a – two-factor authentication: authenticator app (TOTP), recovery codes, the second login
 * step and the password confirmation before security changes.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { FRONTEND_URL } from "../playwright.config";

import { createSignedInAccount, enableTotp, logIn, readSecret, totp } from "./helpers";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function logOut(page: Page) {
  await page.goto("/account");
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("authenticator app and recovery codes protect the login", async ({ page, request }) => {
  const account = await createSignedInAccount(page, request);
  const secret = await enableTotp(page, account.password);

  await page.getByRole("button", { name: "Show codes" }).click();
  await expect(page.getByTestId("recovery-codes")).toBeVisible();
  const codes = await page.getByTestId("recovery-codes").locator("code").allInnerTexts();
  expect(codes).toHaveLength(10);

  // Password alone is not enough any more.
  await logOut(page);
  await page.goto("/login");
  await logIn(page, account.email, account.password);
  await expect(page).toHaveURL(/\/login\/2fa/);
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login/);

  // Wrong code, then a valid one (next 30-second step: the current one was used to turn 2FA on).
  await page.goto("/login");
  await logIn(page, account.email, account.password);
  await page.getByLabel("Code", { exact: true }).fill("000000");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByRole("alert")).toContainText("This code is not valid");
  await page.getByLabel("Code", { exact: true }).fill(totp(secret, Date.now() + 30_000));
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/account$/);

  // A recovery code works exactly once.
  for (const expected of ["works", "rejected"] as const) {
    await logOut(page);
    await page.goto("/login");
    await logIn(page, account.email, account.password);
    await expect(page).toHaveURL(/\/login\/2fa/);
    await page.getByLabel("Code", { exact: true }).fill(codes[0]);
    await page.getByRole("button", { name: "Verify" }).click();
    if (expected === "works") await expect(page).toHaveURL(/\/account$/);
    else await expect(page.getByRole("alert")).toContainText("This code is not valid");
  }
});

test("the second login step works without JavaScript", async ({ page, request, browser }) => {
  const account = await createSignedInAccount(page, request);
  const secret = await enableTotp(page, account.password);

  const context = await browser.newContext({ javaScriptEnabled: false });
  const noJs = await context.newPage();
  await noJs.goto("/login");
  await logIn(noJs, account.email, account.password);
  await expect(noJs).toHaveURL(/\/login\/2fa/);
  await noJs.getByLabel("Code", { exact: true }).fill(totp(secret, Date.now() + 30_000));
  await noJs.getByRole("button", { name: "Verify" }).click();
  await expect(noJs).toHaveURL(/\/account$/);
  await context.close();
});

test("the 2FA step and security settings are not reachable without the right session", async ({ page, request }) => {
  await page.goto("/login/2fa");
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/settings/security");
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.goto("/reauthenticate");
  await expect(page).toHaveURL(/\/login\?next=/);

  // A foreign "next" target is never followed.
  const response = await request.get("/login/2fa?next=https://evil.example/", { maxRedirects: 0 });
  expect(response.headers()["location"] ?? "").not.toContain("evil.example");
});

test("security pages have no WCAG A/AA violations in light and dark", async ({ page, request, context }) => {
  const account = await createSignedInAccount(page, request);
  for (const theme of ["light", "dark"]) {
    await context.addCookies([{ name: "theme", value: theme, url: FRONTEND_URL }]);
    for (const path of ["/settings/security", "/reauthenticate"]) {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
      expect(results.violations.map((v) => `${theme} ${path}: ${v.id}`)).toEqual([]);
    }
  }
  // The second login step, reached with a real pending login.
  await enableTotp(page, account.password);
  await logOut(page);
  await page.goto("/login");
  await logIn(page, account.email, account.password);
  await expect(page).toHaveURL(/\/login\/2fa/);
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations.map((v) => `/login/2fa: ${v.id}`)).toEqual([]);
});

test("ASVS V6.2.2/V6.2.3: change the password with the current one; the new one signs in", async ({ page, request, browser }) => {
  const account = await createSignedInAccount(page, request);
  await page.goto("/settings/security");
  const panel = page.getByRole("region", { name: "Password" });
  await expect(panel.getByLabel("Current password")).toHaveAttribute("type", "password");
  await expect(panel.getByLabel("New password")).toHaveAttribute("type", "password");
  const newPassword = `${account.password}-renewed`;
  // A wrong current password is refused.
  await panel.getByLabel("Current password").fill("not-my-password");
  await panel.getByLabel("New password").fill(newPassword);
  await panel.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("The current password is not correct.")).toBeVisible();
  // A common password is refused.
  await panel.getByLabel("Current password").fill(account.password);
  await panel.getByLabel("New password").fill("password1234");
  await panel.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText(/The new password does not meet the rules/)).toBeVisible();
  // The change works and keeps this session signed in.
  await panel.getByLabel("Current password").fill(account.password);
  await panel.getByLabel("New password").fill(newPassword);
  await panel.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Your password was changed. You stay signed in on this device.")).toBeVisible();
  await page.goto("/account");
  await expect(page.getByTestId("signed-in-as")).toBeVisible();
  // In a fresh browser: the old password no longer works, the new one does.
  const fresh = await browser.newContext();
  const other = await fresh.newPage();
  await other.goto("/login");
  await logIn(other, account.email, account.password);
  await expect(other.getByRole("alert")).toContainText("incorrect");
  await logIn(other, account.email, newPassword);
  await expect(other).toHaveURL(/\/account$/);
  await fresh.close();
});
