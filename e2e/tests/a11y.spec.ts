/**
 * WP 8.6 part C – accessibility pass over every page (docs/ACCESSIBILITY.md).
 *
 * 1. Every page at phone width (390 px), in the light and the dark theme: no WCAG 2.2 A/AA
 *    violation found by axe and no horizontal scrolling (WCAG 1.4.10 Reflow).
 * 2. Inventory: every page of frontend/app/routes.ts (a route module with a default export) is
 *    checked here, or with axe in the named spec when it needs a state this file does not build,
 *    or is listed with the reason why it cannot be tested automatically. A new page without a
 *    check makes the last test fail.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { FRONTEND_URL } from "../playwright.config";

import { createProject, createSignedInAccount, enableTotp, linkFromMail, newAccount, setRole, signUp } from "./helpers";

const HERE = dirname(fileURLToPath(import.meta.url));
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** Pages that need a state this file does not build; the named spec runs axe on them. */
const CHECKED_ELSEWHERE: Record<string, string> = {
  "login/2fa": "mfa.spec.ts",
  reauthenticate: "mfa.spec.ts",
  goodbye: "lifecycle.spec.ts",
  "login/provider/callback": "github.spec.ts",
  "p/:slug/c/:campaign/download/:id": "campaigns.spec.ts",
  "moderation/:type/:id": "moderation.spec.ts",
  "moderation/access/:id": "moderator-access.spec.ts",
};

/** Pages without an automatic check, and why (the manual checklist covers the first). */
const NOT_CHECKED: Record<string, string> = {
  "signup/github": "needs a sign-up started at GitHub; tests never contact GitHub (manual check)",
  "probe/public/:id": "test-only SSR probe, 404 in production",
  "probe/private/:id": "test-only SSR probe, 404 in production",
};

/** Route patterns visited in this file (filled by `check`). */
const visited = new Set<string>();

test.use({ viewport: { width: 390, height: 844 } });

/** Light and dark: axe and reflow; collects every problem instead of stopping at the first. */
async function check(page: Page, path: string, pattern: string, problems: string[]) {
  for (const theme of ["light", "dark"] as const) {
    await page.context().addCookies([{ name: "theme", value: theme, url: FRONTEND_URL }]);
    const response = await page.goto(path);
    expect(response?.status(), `${path} (${theme})`).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    problems.push(...results.violations.map((v) => `${theme} ${path}: ${v.id} (${v.nodes.length})`));
    if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) {
      problems.push(`${theme} ${path}: scrolls horizontally at 390 px`);
    }
  }
  visited.add(pattern);
}

test("public pages at phone width, light and dark", async ({ page, request }) => {
  test.setTimeout(120_000);
  const problems: string[] = [];
  for (const [path, pattern] of [
    ["/", ""],
    ["/discover", "discover"],
    ["/login", "login"],
    ["/signup", "signup"],
    ["/password/forgot", "password/forgot"],
    ["/privacy", "privacy"],
    ["/terms", "terms"],
    ["/imprint", "imprint"],
    ["/design-system", "design-system"],
  ]) {
    await check(page, path, pattern, problems);
  }

  // Sign-up, confirmation link and password reset link, as a visitor sees them.
  const account = newAccount();
  await signUp(page, account);
  await expect(page).toHaveURL(/\/signup\/check-email$/);
  await check(page, "/signup/check-email", "signup/check-email", problems);
  const verify = new URL(await linkFromMail(request, account.email, "verify-email")).pathname;
  await check(page, verify, "verify-email/:key", problems);
  await page.goto(verify);
  await page.getByRole("button", { name: "Confirm email address" }).click();
  await expect(page).toHaveURL(/\/login\?verified=1$/);
  await page.goto("/password/forgot");
  await page.getByLabel("Email address").fill(account.email);
  await page.getByRole("button", { name: "Send link" }).click();
  const reset = new URL(await linkFromMail(request, account.email, "password/reset")).pathname;
  await check(page, reset, "password/reset/:key", problems);
  await check(page, `/u/${account.username}`, "u/:username", problems);
  expect(problems).toEqual([]);
});

test("team and tester pages at phone width, light and dark", async ({ page, request, browser }) => {
  test.setTimeout(240_000);
  const problems: string[] = [];
  const owner = await createSignedInAccount(page, request);
  const project = await createProject(page);
  for (const [path, pattern] of [
    ["/account", "account"],
    ["/settings/profile", "settings/profile"],
    ["/settings", "settings"],
    ["/settings/security", "settings/security"],
    ["/settings/account", "settings/account"],
    ["/projects/new", "projects/new"],
    [`/p/${project}`, "p/:slug"],
    [`/p/${project}/edit`, "p/:slug/edit"],
    [`/p/${project}/team`, "p/:slug/team"],
    [`/p/${project}/c/new`, "p/:slug/c/new"],
  ]) {
    await check(page, path, pattern, problems);
  }

  // A published campaign with a task and one invited tester.
  await page.goto(`/p/${project}/c/new`);
  await page.getByLabel("Title").fill("Beta 1");
  await page.getByLabel("Short name").fill("beta-1");
  await page.getByLabel("Summary").fill("Try the new sync engine.");
  await page.getByLabel("Software version").fill("2.0.0-beta.1");
  await page.getByLabel("Start").fill("2027-03-01T09:00");
  await page.getByLabel("End").fill("2027-03-15T18:00");
  await page.getByLabel("Testers wanted").fill("5");
  await page.getByLabel("Combined testing", { exact: true }).check();
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/c\/beta-1$/);
  await page.goto(`/p/${project}/c/beta-1/edit`);
  const tasks = page.getByRole("region", { name: "Test tasks" });
  await tasks.getByRole("textbox", { name: "Task", exact: true }).fill("Import a file");
  await tasks.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByText("The task was added.")).toBeVisible();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page).toHaveURL(/\/c\/beta-1$/);

  const testerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const tester = await testerContext.newPage();
  const testerAccount = await createSignedInAccount(tester, request);
  await page.goto(`/p/${project}/c/beta-1/testers`);
  await page.getByLabel("Username").fill(testerAccount.username);
  await page.getByRole("button", { name: "Invite" }).click();
  await expect(page.getByText("The invitation was sent.")).toBeVisible();
  await tester.goto("/account");
  await tester.getByRole("button", { name: "Accept the invitation to Beta 1" }).click();
  await expect(tester.getByText("You take part in the campaign now.")).toBeVisible();

  // The tester gives feedback.
  const campaign = `/p/${project}/c/beta-1`;
  await tester.goto(campaign);
  await tester.getByRole("link", { name: "Give feedback" }).click();
  await expect(tester).toHaveURL(/\/feedback\/new/);
  const choose = new URL(tester.url());
  await check(tester, choose.pathname + choose.search, "p/:slug/c/:campaign/feedback/new", problems);
  await tester.goto(choose.pathname + choose.search);
  await tester.getByRole("link", { name: "Bug report" }).click();
  await expect(tester.getByLabel("Steps to reproduce")).toBeVisible();
  const form = new URL(tester.url());
  await check(tester, form.pathname + form.search, "p/:slug/c/:campaign/feedback/new", problems);
  await tester.goto(form.pathname + form.search);
  await tester.getByLabel("Title").fill("Import crashes");
  await tester.getByLabel("Description").fill("The app closes when importing.");
  await tester.getByLabel("Steps to reproduce").fill("1. Open File\n2. Import a CSV");
  await tester.getByLabel("Expected behaviour").fill("The file is imported.");
  await tester.getByLabel("Actual behaviour").fill("The app closes.");
  await tester.getByRole("button", { name: "Send feedback" }).click();
  await expect(tester.getByText("Thank you. Your feedback was sent.")).toBeVisible();
  await expect(tester).toHaveURL(/\/feedback\/[0-9a-f-]{36}/);
  const feedback = new URL(tester.url()).pathname;
  await check(tester, `${feedback}/edit`, "p/:slug/c/:campaign/feedback/:id/edit", problems);
  await tester.goto(`/p/${project}`);
  await tester.getByRole("link", { name: "Report" }).click();
  await expect(tester).toHaveURL(/\/report\?/);
  const report = new URL(tester.url());
  await check(tester, report.pathname + report.search, "report", problems);

  // The team's view of the campaign and its feedback.
  for (const [path, pattern] of [
    [campaign, "p/:slug/c/:campaign"],
    [`${campaign}/edit`, "p/:slug/c/:campaign/edit"],
    [`${campaign}/testers`, "p/:slug/c/:campaign/testers"],
    [`${campaign}/feedback`, "p/:slug/c/:campaign/feedback"],
    [feedback, "p/:slug/c/:campaign/feedback/:id"],
    [`/u/${owner.username}`, "u/:username"],
  ]) {
    await check(page, path, pattern, problems);
  }
  await testerContext.close();
  expect(problems).toEqual([]);
});

test("moderation and platform pages at phone width, light and dark", async ({ page, request }) => {
  test.setTimeout(180_000);
  const problems: string[] = [];
  const admin = await createSignedInAccount(page, request);
  await enableTotp(page, admin.password);
  setRole(admin.username, "admin"); // admins are moderators as well
  for (const [path, pattern] of [
    ["/moderation", "moderation"],
    ["/moderation/suspensions", "moderation/suspensions"],
    ["/moderation/accesses", "moderation/accesses"],
    ["/moderation/statistics", "moderation/statistics"],
    ["/platform/roles", "platform/roles"],
    ["/platform/metrics", "platform/metrics"],
  ]) {
    await check(page, path, pattern, problems);
  }
  expect(problems).toEqual([]);
});

test("every page has an accessibility check (inventory of routes.ts)", () => {
  const app = resolve(HERE, "../../frontend/app");
  const source = readFileSync(resolve(app, "routes.ts"), "utf8");
  const routes = [...source.matchAll(/(?:index|route)\((?:"([^"]*)",\s*)?"(routes\/[^"]+)"/g)].map((m) => ({
    pattern: m[1] ?? "",
    module: m[2],
  }));
  expect(routes.length).toBeGreaterThan(50); // the pattern still reads routes.ts
  const pages = routes
    .filter(({ module }) => /^export default /m.test(readFileSync(resolve(app, module), "utf8")))
    .map(({ pattern }) => pattern);

  const unchecked = pages.filter((p) => !visited.has(p) && !(p in CHECKED_ELSEWHERE) && !(p in NOT_CHECKED));
  expect(unchecked, "pages without an accessibility check").toEqual([]);
  const stale = [...Object.keys(CHECKED_ELSEWHERE), ...Object.keys(NOT_CHECKED)].filter((p) => !pages.includes(p));
  expect(stale, "listed patterns that are no longer pages").toEqual([]);
  for (const spec of new Set(Object.values(CHECKED_ELSEWHERE))) {
    expect(readFileSync(resolve(HERE, spec), "utf8"), spec).toContain("new AxeBuilder(");
  }
});
