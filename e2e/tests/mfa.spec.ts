/**
 * WP 1.3a – two-factor authentication: authenticator app (TOTP), recovery codes, the second login
 * step and the password confirmation before security changes.
 */
import { createHmac } from "node:crypto";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { FRONTEND_URL } from "../playwright.config";

import { createSignedInAccount, logIn } from "./helpers";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** RFC 6238 TOTP (SHA-1, 6 digits, 30-second steps), independent of the application. */
function totp(secret: string, at = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = secret
    .replace(/[\s=]/g, "")
    .toUpperCase()
    .split("")
    .map((c) => alphabet.indexOf(c).toString(2).padStart(5, "0"))
    .join("");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

async function readSecret(page: Page): Promise<string> {
  return (await page.getByTestId("totp-secret").innerText()).replace(/\s+/g, "");
}

/** Turns on TOTP from the security page, including the password confirmation. */
async function enableTotp(page: Page, password: string): Promise<string> {
  await page.goto("/settings/security");
  await page.getByLabel("Code", { exact: true }).fill(totp(await readSecret(page)));
  await page.getByRole("button", { name: "Turn on" }).click();

  // Security changes require a fresh password confirmation.
  await expect(page).toHaveURL(/\/reauthenticate\?next=/);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page).toHaveURL(/\/settings\/security$/);

  const secret = await readSecret(page);
  await page.getByLabel("Code", { exact: true }).fill(totp(secret));
  await page.getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByRole("status").first()).toContainText("Two-factor authentication is on.");
  return secret;
}

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
