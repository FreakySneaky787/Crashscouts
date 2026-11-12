/**
 * WP 1.3b – passkeys (WebAuthn) with Chromium's virtual authenticator (DevTools protocol):
 * add a passkey (with password confirmation), passwordless login, passkey as second factor,
 * removal, and that a removed passkey no longer works.
 */
import { expect, test, type Page } from "@playwright/test";

import { createSignedInAccount, logIn } from "./helpers";

/** A platform authenticator with user verification, like a phone or laptop with a fingerprint. */
async function addVirtualAuthenticator(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

async function confirmPassword(page: Page, password: string) {
  await expect(page).toHaveURL(/\/reauthenticate\?next=/);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page).toHaveURL(/\/settings\/security$/);
}

async function logOut(page: Page) {
  await page.goto("/account");
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("passkey: add, sign in without password, use as second factor, remove", async ({ page, request }) => {
  await addVirtualAuthenticator(page);
  const account = await createSignedInAccount(page, request);

  // Adding a passkey first asks for the password, then the browser dialog (virtual authenticator).
  await page.goto("/settings/security");
  await page.getByRole("button", { name: "Add a passkey" }).click();
  await confirmPassword(page, account.password);
  await page.getByLabel("Name").fill("Test laptop");
  await page.getByRole("button", { name: "Add a passkey" }).click();
  await expect(page.getByRole("status").first()).toContainText("Passkey added.");
  await expect(page.getByRole("list", { name: "Passkeys" })).toContainText("Test laptop");

  // Passwordless login.
  await logOut(page);
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in with a passkey" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByTestId("signed-in-as")).toContainText(account.username);

  // With a passkey, the password alone is not enough: the passkey confirms as second factor.
  await logOut(page);
  await page.goto("/login");
  await logIn(page, account.email, account.password);
  await expect(page).toHaveURL(/\/login\/2fa/);
  await page.getByRole("button", { name: "Confirm with a passkey" }).click();
  await expect(page).toHaveURL(/\/account$/);

  // Removing the passkey also needs a fresh confirmation: a login does not count as one.
  await page.goto("/settings/security");
  await page.getByRole("button", { name: "Remove passkey Test laptop" }).click();
  await confirmPassword(page, account.password);
  await page.getByRole("button", { name: "Remove passkey Test laptop" }).click();
  await expect(page.getByRole("status").first()).toContainText("The passkey was removed.");

  // The authenticator still holds the key, but the server no longer accepts it.
  await logOut(page);
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in with a passkey" }).click();
  await expect(page.getByRole("alert")).toContainText("The passkey could not be used");
  await expect(page).toHaveURL(/\/login$/);
});

test("passkey buttons explain that JavaScript is needed when it is off", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/login");
  await expect(page.getByText("Passkeys need JavaScript in your browser.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in with a passkey" })).toHaveCount(0);
  await context.close();
});

test("the passkey endpoint rejects unknown intents and GET", async ({ request }) => {
  expect((await request.get("/passkeys")).status()).toBe(404);
  const bogus = await request.post("/passkeys", { data: { intent: "delete-everything" } });
  expect(bogus.status()).toBe(400);
  const anonymous = await request.post("/passkeys", { data: { intent: "register-options" } });
  expect((await anonymous.json()).ok).toBe(false);
});
