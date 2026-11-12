/**
 * SSR auth spike (WP 0.4): the six acceptance criteria from docs/MVP-PLAN.md.
 * The SSR architecture only counts as validated when every test in this file passes.
 */
import { execFileSync } from "node:child_process";

import { expect, test, type Browser, type Page } from "@playwright/test";

const BACKEND_URL = "http://127.0.0.1:8000";

const env = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing (global-setup.ts)`);
  return value;
};

const owner = () => ({ email: "probe-owner@example.test", password: env("PROBE_OWNER_PASSWORD") });
const stranger = () => ({ email: "probe-stranger@example.test", password: env("PROBE_STRANGER_PASSWORD") });
const publicPath = () => `/probe/public/${env("PROBE_PUBLIC_ID")}`;
const privatePath = () => `/probe/private/${env("PROBE_PRIVATE_ID")}`;

async function login(page: Page, user: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

/** Collects CSP violations and JavaScript errors; the list must be empty at the end of a test. */
function watchConsole(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));
  return problems;
}

async function loggedInPage(browser: Browser, user: { email: string; password: string }) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, user);
  return { context, page };
}

test("(1) a public page is server-side rendered", async ({ browser, request }) => {
  const response = await request.get(publicPath());
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toMatch(/<h1[^>]*>Public probe item<\/h1>/);

  // The content is fully visible even without JavaScript.
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(publicPath());
  await expect(page.getByRole("heading", { name: "Public probe item" })).toBeVisible();
  await context.close();
});

test("(2) a signed-in user opens a protected page", async ({ page }) => {
  const problems = watchConsole(page);

  // Anonymous: redirected to the login page.
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login\?next=%2Faccount$|\/login\?next=\/account$/);

  await login(page, owner());
  await expect(page.getByTestId("signed-in-as")).toHaveText("Signed in as probe-owner");
  expect(problems).toEqual([]);
});

test("(3) the session persists; Set-Cookie and CSRF work", async ({ page, context }) => {
  const problems = watchConsole(page);
  await login(page, owner());

  // The Set-Cookie from login was passed on correctly by the SSR server.
  const session = (await context.cookies()).find((c) => c.name === "sessionid");
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe("Lax");

  // Several (client-side) navigations and a reload.
  await page.getByRole("link", { name: "Home" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole("link", { name: "Account" }).click();
  await expect(page.getByTestId("signed-in-as")).toHaveText("Signed in as probe-owner");
  await page.reload();
  await expect(page.getByTestId("signed-in-as")).toHaveText("Signed in as probe-owner");

  // Write action with CSRF token.
  await page.goto(privatePath());
  const counter = page.getByTestId("touch-count");
  const before = Number((await counter.textContent())?.match(/\d+/)?.[0]);
  await page.getByRole("button", { name: "Touch" }).click();
  await expect(counter).toHaveText(`Touched ${before + 1} times`);
  await page.reload();
  await expect(counter).toHaveText(`Touched ${before + 1} times`);

  // Negative checks — two independent layers:
  // (a) Django rejects a wrong CSRF token (forwarded by the SSR server) with 403.
  const wrongToken = await page.request.post(privatePath(), {
    form: { csrf_token: "invalid-token" },
  });
  expect(wrongToken.status()).toBe(403);
  // (b) React Router itself rejects actions from a foreign Origin (400, before our code runs).
  const csrf = (await context.cookies()).find((c) => c.name === "csrftoken")?.value ?? "";
  const foreignOriginViaSsr = await page.request.post(privatePath(), {
    form: { csrf_token: csrf },
    headers: { Origin: "https://evil.example" },
  });
  expect(foreignOriginViaSsr.status()).toBe(400);
  // (c) Django also rejects a foreign Origin directly — even with a valid session and token.
  const foreignOriginDirect = await page.request.post(
    `${BACKEND_URL}/api/v1/probe/items/${env("PROBE_PRIVATE_ID")}/touch/`,
    { headers: { Origin: "https://evil.example", "X-CSRFToken": csrf } },
  );
  expect(foreignOriginDirect.status()).toBe(403);
  // Control: the same direct request from the trusted origin works, so (c) failed only due to Origin.
  const trustedOriginDirect = await page.request.post(
    `${BACKEND_URL}/api/v1/probe/items/${env("PROBE_PRIVATE_ID")}/touch/`,
    { headers: { Origin: "http://127.0.0.1:3000", "X-CSRFToken": csrf } },
  );
  expect(trustedOriginDirect.status()).toBe(200);
  await page.reload();
  await expect(counter).toHaveText(`Touched ${before + 2} times`);

  // Logout: the session cookie is removed and the protected page is locked again.
  await page.goto("/account");
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/$/);
  expect((await context.cookies()).find((c) => c.name === "sessionid")).toBeUndefined();
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login/);

  expect(problems).toEqual([]);
});

test("(4) a private object is not retrievable for strangers and anonymous users", async ({
  browser,
  request,
}) => {
  const apiPath = `${BACKEND_URL}/api/v1/probe/items/${env("PROBE_PRIVATE_ID")}/`;

  // Anonymous – SSR and API.
  const anonymousSsr = await request.get(privatePath());
  expect(anonymousSsr.status()).toBe(404);
  expect(await anonymousSsr.text()).not.toContain("Private probe item");
  expect((await request.get(apiPath)).status()).toBe(404);

  // Another user – SSR and API (with their own cookies).
  const { context, page } = await loggedInPage(browser, stranger());
  const strangerSsr = await page.goto(privatePath());
  expect(strangerSsr?.status()).toBe(404);
  await expect(page.getByText("Private probe item")).toHaveCount(0);
  const strangerApi = await context.request.get(apiPath);
  expect(strangerApi.status()).toBe(404);

  // Control: the owner can see it.
  const ownerSession = await loggedInPage(browser, owner());
  const ownerSsr = await ownerSession.page.goto(privatePath());
  expect(ownerSsr?.status()).toBe(200);

  await context.close();
  await ownerSession.context.close();
});

test("(5) private responses are not cached; public ones set no cookies", async ({
  browser,
  request,
}) => {
  // Anonymous, public: cacheable and without Set-Cookie.
  for (const path of ["/", publicPath()]) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("public, max-age=60");
    expect(response.headers()["vary"]).toContain("Cookie");
    expect(response.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie")).toEqual(
      [],
    );
  }

  // Signed in: everything private and not storable – including the public page.
  const { context, page } = await loggedInPage(browser, owner());
  for (const path of ["/account", privatePath(), publicPath(), "/"]) {
    const response = await page.goto(path);
    const headers = response?.headers() ?? {};
    expect(headers["cache-control"], path).toBe("private, no-store");
    expect(headers["vary"], path).toContain("Cookie");
  }
  // Error pages too.
  const notFound = await page.goto("/probe/private/not-a-uuid");
  expect(notFound?.status()).toBe(404);
  expect(notFound?.headers()["cache-control"]).toBe("private, no-store");
  await context.close();
});

test("(6) curl without JavaScript receives complete HTML with title and Open Graph tags", () => {
  const url = `http://127.0.0.1:3000${publicPath()}`;
  const html = execFileSync("curl", ["-sS", "--fail", url], { encoding: "utf-8" });

  expect(html).toContain("<title>Public probe item · TestHub</title>");
  expect(html).toContain('<meta property="og:title" content="Public probe item · TestHub"/>');
  expect(html).toContain(
    '<meta property="og:description" content="A public item rendered on the server."/>',
  );
  expect(html).toContain('<meta name="description" content="A public item rendered on the server."/>');
  expect(html).toMatch(/<h1[^>]*>Public probe item<\/h1>/);
});

test("security headers and CSP are set in the production build", async ({ request }) => {
  const response = await request.get("/");
  const headers = response.headers();
  expect(headers["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+'/);
  expect(headers["content-security-policy"]).toContain("object-src 'none'");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("same-origin");

  // Every response gets a fresh nonce.
  const again = (await request.get("/")).headers()["content-security-policy"];
  expect(again).not.toBe(headers["content-security-policy"]);
});

test("logout via GET is not possible", async ({ browser }) => {
  const { context, page } = await loggedInPage(browser, owner());
  await page.goto("/logout");
  await page.goto("/account");
  await expect(page.getByTestId("signed-in-as")).toHaveText("Signed in as probe-owner");
  await context.close();
});
