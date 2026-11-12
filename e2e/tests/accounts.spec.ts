/**
 * WP 1.1 – accounts: signup with email confirmation, login by email, password reset.
 * Emails are real: Django sends them via SMTP to Mailpit, the tests read them from its API.
 */
import { randomBytes } from "node:crypto";

import { expect, test } from "@playwright/test";

import { MAILPIT_URL } from "../playwright.config";

import { linkFromMail, logIn, newAccount, signUp, type MailpitSearch } from "./helpers";

test("sign up, confirm the email, log in and out", async ({ page, request }) => {
  const account = newAccount();
  await signUp(page, account);
  await expect(page).toHaveURL(/\/signup\/check-email$/);
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();

  // Not confirmed yet: login is refused with a clear hint.
  await page.goto("/login");
  await logIn(page, account.email, account.password);
  await expect(page.getByRole("alert")).toContainText("Confirm your email address first");

  // Opening the link alone does not confirm (mail scanners); the button does.
  const link = await linkFromMail(request, account.email, "verify-email");
  await page.goto(link);
  await expect(page.getByText(`Confirm that ${account.email} belongs to you.`)).toBeVisible();
  await page.getByRole("button", { name: "Confirm email address" }).click();
  await expect(page).toHaveURL(/\/login\?verified=1$/);
  await expect(page.getByRole("status")).toContainText("Email address confirmed");

  await logIn(page, account.email.toUpperCase(), account.password);
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByTestId("signed-in-as")).toContainText(account.username);

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("signup errors are shown per field and the password is never echoed back", async ({ browser }) => {
  // Without JavaScript the page is rendered by the server: what it sends back is all there is.
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  const account = newAccount();
  await page.goto("/signup");
  await page.getByLabel("Email address").fill(account.email);
  await page.getByLabel("Username").fill("Admin");
  await page.getByLabel("Password").fill("short-pass1");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByText("This username is reserved. Choose another one.")).toBeVisible();
  await expect(page.getByText("The password must be at least 12 characters long.")).toBeVisible();
  await expect(page.getByText("You must be at least 16 years old to sign up.")).toBeVisible();
  await expect(page.getByLabel("Email address")).toHaveValue(account.email);
  await expect(page.getByLabel("Password")).toHaveValue("");
  await expect(page.getByLabel("Password")).toHaveAttribute("aria-invalid", "true");
  expect(await page.content()).not.toContain("short-pass1");
  await context.close();
});

test("signing up with a registered address looks like success (no account enumeration)", async ({ page, request }) => {
  const first = newAccount();
  await signUp(page, first);
  await expect(page).toHaveURL(/\/signup\/check-email$/);

  const second = { ...newAccount(), email: first.email.toUpperCase() };
  await signUp(page, second);
  await expect(page).toHaveURL(/\/signup\/check-email$/);

  // allauth's per-address cooldown (3 minutes) also covers the "account already exists" notice,
  // so repeated attempts cannot flood the owner's inbox. (The notice itself is tested in pytest.)
  await linkFromMail(request, first.email, "verify-email");
  await page.waitForTimeout(1500);
  const search = (await (
    await request.get(`${MAILPIT_URL}/api/v1/search`, { params: { query: `to:${first.email}` } })
  ).json()) as MailpitSearch;
  expect(search.messages).toHaveLength(1);
});

test("password reset by email link", async ({ page, request }) => {
  const account = newAccount();
  await signUp(page, account);
  await page.goto(await linkFromMail(request, account.email, "verify-email"));
  await page.getByRole("button", { name: "Confirm email address" }).click();
  // Wait for each navigation to finish: login and reset pages both have an "Email address" field.
  await expect(page).toHaveURL(/\/login\?verified=1$/);

  await page.getByRole("link", { name: "Forgot your password?" }).click();
  await expect(page).toHaveURL(/\/password\/forgot$/);
  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
  await page.getByLabel("Email address").fill(account.email);
  await page.getByRole("button", { name: "Send link" }).click();
  await expect(page.getByRole("status")).toContainText("Check your inbox");

  const resetLink = await linkFromMail(request, account.email, "password/reset");
  await page.goto(resetLink);
  await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  await page.getByLabel("New password", { exact: true }).fill("too-short");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByText("The password must be at least 12 characters long.")).toBeVisible();

  const newPassword = randomBytes(18).toString("base64url");
  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page).toHaveURL(/\/login\?reset=1$/);

  // The link is single-use; the old password no longer works, the new one does.
  await page.goto(resetLink);
  await expect(page.getByRole("alert")).toContainText("invalid or has expired");
  await page.goto("/login");
  await logIn(page, account.email, account.password);
  await expect(page.getByRole("alert")).toContainText("incorrect");
  await logIn(page, account.email, newPassword);
  await expect(page).toHaveURL(/\/account$/);
});

test("reset request for an unknown address gives the same answer", async ({ page }) => {
  await page.goto("/password/forgot");
  await page.getByLabel("Email address").fill(`nobody-${randomBytes(4).toString("hex")}@example.test`);
  await page.getByRole("button", { name: "Send link" }).click();
  await expect(page.getByRole("status")).toContainText("If an account uses this address");
});

test("invalid confirmation and reset links are rejected", async ({ request, page }) => {
  for (const path of ["/verify-email/not-a-real-key", "/password/reset/not-a-real-key", "/verify-email/..%2F..%2Fadmin"]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(400);
    expect(response.headers()["cache-control"]).toContain("no-store");
  }
  await page.goto("/verify-email/not-a-real-key");
  await expect(page.getByRole("alert")).toContainText("invalid or has expired");
});

test("signup works without JavaScript", async ({ browser, request }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  const account = newAccount();
  await signUp(page, account);
  await expect(page).toHaveURL(/\/signup\/check-email$/);
  await page.goto(await linkFromMail(request, account.email, "verify-email"));
  await page.getByRole("button", { name: "Confirm email address" }).click();
  await expect(page).toHaveURL(/\/login\?verified=1$/);
  await context.close();
});
