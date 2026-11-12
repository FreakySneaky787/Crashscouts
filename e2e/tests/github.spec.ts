/**
 * WP 1.4 – GitHub login. GitHub itself is never contacted: requests to github.com are intercepted,
 * and the way back is checked with a forged state that Django must reject before any network call.
 */
import { expect, test, type Page } from "@playwright/test";

import { FRONTEND_URL } from "../playwright.config";

import { createSignedInAccount } from "./helpers";

/**
 * Clicks a GitHub button and returns where the server sends the browser. The form POST to
 * /auth/github really reaches the SSR server and Django; only the final redirect to github.com is
 * not followed (Playwright cannot intercept redirects of a navigation, and tests must not load
 * GitHub). That browsers may follow it is covered by the CSP test below.
 */
async function captureGitHubRedirect(page: Page, click: () => Promise<void>): Promise<URL> {
  let target: URL | null = null;
  await page.route("**/auth/github", async (route) => {
    const response = await route.fetch({ maxRedirects: 0 });
    target = new URL(response.headers()["location"] ?? "about:blank");
    await route.fulfill({ status: 200, contentType: "text/plain", body: "Redirect to GitHub captured by the test." });
  });
  await click();
  await expect.poll(() => target?.href ?? "").not.toBe("");
  return target!;
}

test("login with GitHub starts at GitHub with the public callback URL", async ({ page }) => {
  await page.goto("/login");
  const url = await captureGitHubRedirect(page, () => page.getByRole("button", { name: "Continue with GitHub" }).click());

  expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
  expect(url.searchParams.get("client_id")).toBe("e2e-dummy-client-id");
  expect(url.searchParams.get("redirect_uri")).toBe(`${FRONTEND_URL}/accounts/github/login/callback/`);
  expect(url.searchParams.get("scope")?.split(" ").sort()).toEqual(["read:user", "user:email"]);
  expect(url.searchParams.get("state")).toBeTruthy();
});

test("a forged state on the way back is rejected with a clear message", async ({ page }) => {
  await page.goto("/login");
  await captureGitHubRedirect(page, () => page.getByRole("button", { name: "Continue with GitHub" }).click());
  await page.unrouteAll();

  await page.goto("/accounts/github/login/callback/?code=forged&state=forged");
  await expect(page).toHaveURL(/\/login\/provider\/callback\?error=/);
  await expect(page.getByRole("alert")).toContainText("The GitHub sign-in did not work.");
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login/);
});

test("GitHub login works without JavaScript up to GitHub", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/signup");
  const url = await captureGitHubRedirect(page, () => page.getByRole("button", { name: "Continue with GitHub" }).click());
  expect(url.host).toBe("github.com");
  await context.close();
});

test("signed-in users can connect GitHub only from the security settings", async ({ page, request }) => {
  await createSignedInAccount(page, request);
  await page.goto("/settings/security");
  const url = await captureGitHubRedirect(page, () => page.getByRole("button", { name: "Connect GitHub" }).click());
  expect(url.searchParams.get("client_id")).toBe("e2e-dummy-client-id");
});

test("the GitHub endpoints reject misuse", async ({ request }) => {
  // GET does not start anything.
  const get = await request.get("/auth/github", { maxRedirects: 0 });
  expect(get.status()).toBe(302);
  expect(get.headers()["location"]).toBe("/login");
  // Without a CSRF token Django refuses; the browser is never sent to GitHub.
  const noToken = await request.post("/auth/github", { form: { process: "login" }, maxRedirects: 0 });
  expect(noToken.headers()["location"] ?? "").not.toContain("github.com");
  // The signup completion needs a pending GitHub signup.
  const signup = await request.get("/signup/github", { maxRedirects: 0 });
  expect(signup.headers()["location"]).toBe("/login");
});

test("the page CSP allows form submissions only to the own origin and GitHub", async ({ request }) => {
  const csp = (await request.get("/login")).headers()["content-security-policy"] ?? "";
  const formAction = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("form-action"));
  expect(formAction).toBe("form-action 'self' https://github.com");
});
