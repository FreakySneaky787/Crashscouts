/**
 * WP 8.6 – The production path end to end (ADR 0032, question P): TLS at Caddy, SSR behind the
 * proxy, Django with production settings. Sign-up with email confirmation, sign-in and sign-out
 * work; cookies carry the "__Host-" prefix and Secure; HSTS and CSP are present; Django, its admin
 * and the API are not reachable from outside; a forged X-Forwarded-For does not get around the
 * login rate limit.
 */
import { randomBytes } from "node:crypto";

import { expect, test, type APIRequestContext } from "@playwright/test";

import { SMOKE_MAILPIT_URL, SMOKE_URL } from "../playwright.smoke.config";
import { png } from "../tests/helpers";

function account() {
  const id = randomBytes(5).toString("hex");
  return { email: `smoke-${id}@example.test`, username: `smoke-${id}`, password: randomBytes(18).toString("base64url") };
}

async function confirmationLink(request: APIRequestContext, to: string): Promise<string> {
  let link = "";
  await expect
    .poll(
      async () => {
        const search = (await (await request.get(`${SMOKE_MAILPIT_URL}/api/v1/search`, { params: { query: `to:${to}` } })).json()) as {
          messages: { ID: string }[];
        };
        if (!search.messages.length) return "";
        const message = (await (await request.get(`${SMOKE_MAILPIT_URL}/api/v1/message/${search.messages[0].ID}`)).json()) as { Text: string };
        link = message.Text.match(new RegExp(`${SMOKE_URL}/verify-email/\\S+`))?.[0] ?? "";
        return link;
      },
      { timeout: 20_000 },
    )
    .not.toBe("");
  return link;
}

test("sign up, confirm, sign in and out behind the proxy with __Host- cookies", async ({ page, context, request }) => {
  const user = account();
  await page.goto("/signup");
  await page.getByLabel("Email address").fill(user.email);
  await page.getByLabel("Username").fill(user.username);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByLabel("I am at least 16 years old.").check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/signup\/check-email/);

  await page.goto(await confirmationLink(request, user.email));
  await page.getByRole("button", { name: /Confirm/ }).click();
  await expect(page.getByRole("status")).toContainText("Email address confirmed");
  await page.getByLabel("Email address").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByTestId("signed-in-as")).toContainText(user.username);

  const cookies = await context.cookies();
  for (const name of ["__Host-sessionid", "__Host-csrftoken"]) {
    const cookie = cookies.find((c) => c.name === name);
    expect(cookie, name).toBeDefined();
    expect(cookie?.secure).toBe(true);
    expect(cookie?.path).toBe("/");
  }
  expect(cookies.find((c) => c.name === "sessionid" || c.name === "csrftoken")).toBeUndefined();

  // Uploaded images reach the browser through the SSR server (avatars, project images,
  // attachments). In production Django only answers for the public host over HTTPS, so the
  // image request must carry the forwarded headers too (found 2026-11-19: avatars showed empty).
  await page.goto("/settings/profile");
  await page.getByLabel("Image file").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: png(320, 200) });
  await page.getByRole("button", { name: "Upload avatar" }).click();
  await expect(page.getByRole("status")).toContainText("Your avatar was updated.");
  const own = await (await page.request.get(`/u/${user.username}`)).text();
  const avatar = own.match(/src="(\/avatars\/[0-9a-f-]{36})"/)?.[1];
  expect(avatar).toBeTruthy();
  const image = await request.get(avatar!);
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toBe("image/webp");

  await page.getByRole("button", { name: "Dark theme" }).click();
  await expect.poll(async () => (await context.cookies()).find((c) => c.name === "__Host-theme")?.secure).toBe(true);

  await page.goto("/account");
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(new RegExp(`${SMOKE_URL}/$`));
  expect((await context.cookies()).find((c) => c.name === "__Host-sessionid")).toBeUndefined();

  // Public profile, seen by a visitor: fetched without cookies, it must still reach Django as
  // HTTPS behind the proxy (WP 8.6: it returned 404 when the forwarded scheme got lost).
  const profile = await page.goto(`/u/${user.username}`);
  expect(profile?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(user.username);
});

test("security headers; Django, admin and API are not reachable from outside", async ({ request }) => {
  const home = await request.get("/");
  expect(home.status()).toBe(200);
  expect(home.headers()["strict-transport-security"]).toBe("max-age=31536000");
  expect(home.headers()["content-security-policy"]).toContain("default-src 'self'");
  expect(home.headers()["x-content-type-options"]).toBe("nosniff");
  for (const path of ["/admin/", "/admin/login/", "/api/v1/health/", "/_allauth/browser/v1/config", "/media/x"]) {
    const blocked = await request.get(path);
    expect(blocked.status(), path).toBe(404);
    // Caddy answers these itself; HSTS must be there too (ASVS 5.0 V3.4.1).
    expect(blocked.headers()["strict-transport-security"], path).toBe("max-age=31536000");
  }
});

test("a forged X-Forwarded-For does not get around the login rate limit", async ({ page }) => {
  // allauth allows 10 failed logins per minute and IP address (ADR 0022). Every attempt uses a new
  // email address (so the per-account limit never applies) and a new forged X-Forwarded-For: the
  // limit can only kick in if Django counts the real client address set by Caddy.
  let limitedAt = 0;
  for (let attempt = 1; attempt <= 14 && !limitedAt; attempt++) {
    await page.setExtraHTTPHeaders({ "X-Forwarded-For": `203.0.113.${attempt}` });
    await page.goto("/login");
    await page.getByLabel("Email address").fill(account().email);
    await page.getByLabel("Password", { exact: true }).fill("wrong-password-123");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    if (await page.getByText("Too many attempts").isVisible()) limitedAt = attempt;
  }
  expect(limitedAt).toBeGreaterThan(10);
});
