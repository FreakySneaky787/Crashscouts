/**
 * SSR-Auth-Durchstich (AP 0.4): die 6 Abnahmekriterien aus docs/MVP-PLAN.md.
 * Die SSR-Architektur gilt erst als validiert, wenn alle Tests hier grün sind.
 */
import { execFileSync } from "node:child_process";

import { expect, test, type Browser, type Page } from "@playwright/test";

const BACKEND_URL = "http://127.0.0.1:8000";

const env = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} fehlt (global-setup.ts)`);
  return value;
};

const owner = () => ({ username: "probe-owner", password: env("PROBE_OWNER_PASSWORD") });
const stranger = () => ({ username: "probe-stranger", password: env("PROBE_STRANGER_PASSWORD") });
const publicPath = () => `/probe/public/${env("PROBE_PUBLIC_ID")}`;
const privatePath = () => `/probe/private/${env("PROBE_PRIVATE_ID")}`;

async function login(page: Page, user: { username: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Username").fill(user.username);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

/** Sammelt CSP-Verstösse und JavaScript-Fehler; am Testende muss die Liste leer sein. */
function watchConsole(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));
  return problems;
}

async function loggedInPage(browser: Browser, user: { username: string; password: string }) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, user);
  return { context, page };
}

test("(1) eine öffentliche Seite wird serverseitig gerendert", async ({ browser, request }) => {
  const response = await request.get(publicPath());
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain("<h1>Public probe item</h1>");

  // Auch ohne JavaScript ist der Inhalt vollständig sichtbar.
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(publicPath());
  await expect(page.getByRole("heading", { name: "Public probe item" })).toBeVisible();
  await context.close();
});

test("(2) ein angemeldeter Nutzer öffnet eine geschützte Seite", async ({ page }) => {
  const problems = watchConsole(page);

  // Anonym: Weiterleitung zum Login.
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login\?next=%2Faccount$|\/login\?next=\/account$/);

  await login(page, owner());
  await expect(page.getByTestId("signed-in-as")).toHaveText("Signed in as probe-owner");
  expect(problems).toEqual([]);
});

test("(3) Session bleibt erhalten; Set-Cookie und CSRF funktionieren", async ({ page, context }) => {
  const problems = watchConsole(page);
  await login(page, owner());

  // Set-Cookie beim Login wurde vom SSR-Server korrekt weitergegeben.
  const session = (await context.cookies()).find((c) => c.name === "sessionid");
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe("Lax");

  // Mehrere Navigationen (clientseitig) und ein Reload.
  await page.getByRole("link", { name: "Home" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole("link", { name: "Account" }).click();
  await expect(page.getByTestId("signed-in-as")).toHaveText("Signed in as probe-owner");
  await page.reload();
  await expect(page.getByTestId("signed-in-as")).toHaveText("Signed in as probe-owner");

  // Schreibende Aktion mit CSRF-Token.
  await page.goto(privatePath());
  const counter = page.getByTestId("touch-count");
  let before = Number((await counter.textContent())?.match(/\d+/)?.[0]);
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
  before += 1;
  await expect(counter).toHaveText(`Touched ${before + 1} times`);

  // Logout: Session-Cookie wird gelöscht, geschützte Seite ist wieder gesperrt.
  await page.goto("/account");
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/$/);
  expect((await context.cookies()).find((c) => c.name === "sessionid")).toBeUndefined();
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login/);

  expect(problems).toEqual([]);
});

test("(4) ein privates Objekt ist für Fremde und Anonyme nicht abrufbar", async ({
  browser,
  request,
}) => {
  const apiPath = `${BACKEND_URL}/api/v1/probe/items/${env("PROBE_PRIVATE_ID")}/`;

  // Anonym – SSR und API.
  const anonymousSsr = await request.get(privatePath());
  expect(anonymousSsr.status()).toBe(404);
  expect(await anonymousSsr.text()).not.toContain("Private probe item");
  expect((await request.get(apiPath)).status()).toBe(404);

  // Fremder Nutzer – SSR und API (mit seinen eigenen Cookies).
  const { context, page } = await loggedInPage(browser, stranger());
  const strangerSsr = await page.goto(privatePath());
  expect(strangerSsr?.status()).toBe(404);
  await expect(page.getByText("Private probe item")).toHaveCount(0);
  const strangerApi = await context.request.get(apiPath);
  expect(strangerApi.status()).toBe(404);

  // Kontrolle: Der Eigentümer sieht es.
  const ownerSession = await loggedInPage(browser, owner());
  const ownerSsr = await ownerSession.page.goto(privatePath());
  expect(ownerSsr?.status()).toBe(200);

  await context.close();
  await ownerSession.context.close();
});

test("(5) private Antworten werden nicht gecacht, öffentliche setzen keine Cookies", async ({
  browser,
  request,
}) => {
  // Anonym, öffentlich: cachebar und ohne Set-Cookie.
  for (const path of ["/", publicPath()]) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("public, max-age=60");
    expect(response.headers()["vary"]).toContain("Cookie");
    expect(response.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie")).toEqual(
      [],
    );
  }

  // Angemeldet: alles privat und nicht speicherbar – auch die öffentliche Seite.
  const { context, page } = await loggedInPage(browser, owner());
  for (const path of ["/account", privatePath(), publicPath(), "/"]) {
    const response = await page.goto(path);
    const headers = response?.headers() ?? {};
    expect(headers["cache-control"], path).toBe("private, no-store");
    expect(headers["vary"], path).toContain("Cookie");
  }
  // Fehlerseiten ebenfalls.
  const notFound = await page.goto("/probe/private/not-a-uuid");
  expect(notFound?.status()).toBe(404);
  expect(notFound?.headers()["cache-control"]).toBe("private, no-store");
  await context.close();
});

test("(6) curl ohne JavaScript erhält vollständiges HTML mit Titel und Open-Graph-Tags", () => {
  const url = `http://127.0.0.1:3000${publicPath()}`;
  const html = execFileSync("curl", ["-sS", "--fail", url], { encoding: "utf-8" });

  expect(html).toContain("<title>Public probe item · TestHub</title>");
  expect(html).toContain('<meta property="og:title" content="Public probe item · TestHub"/>');
  expect(html).toContain(
    '<meta property="og:description" content="A public item rendered on the server."/>',
  );
  expect(html).toContain('<meta name="description" content="A public item rendered on the server."/>');
  expect(html).toContain("<h1>Public probe item</h1>");
});

test("Sicherheits-Header und CSP sind im Produktions-Build gesetzt", async ({ request }) => {
  const response = await request.get("/");
  const headers = response.headers();
  expect(headers["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+'/);
  expect(headers["content-security-policy"]).toContain("object-src 'none'");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("same-origin");

  // Jede Antwort hat eine neue Nonce.
  const again = (await request.get("/")).headers()["content-security-policy"];
  expect(again).not.toBe(headers["content-security-policy"]);
});

test("Logout per GET ist nicht möglich", async ({ browser }) => {
  const { context, page } = await loggedInPage(browser, owner());
  await page.goto("/logout");
  await page.goto("/account");
  await expect(page.getByTestId("signed-in-as")).toHaveText("Signed in as probe-owner");
  await context.close();
});
