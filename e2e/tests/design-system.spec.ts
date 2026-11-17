/**
 * Design system (docs/DESIGN-SYSTEM.md): accessibility in both themes, theme switching with and
 * without JavaScript, server-rendered theme without a flash, self-hosted fonts, CSP compliance.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { FRONTEND_URL } from "../playwright.config";

const ORIGIN = FRONTEND_URL;
const PAGES = ["/", "/design-system", "/login", "/signup", "/signup/check-email", "/password/forgot"];
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function setThemeCookie(context: BrowserContext, theme: "light" | "dark") {
  await context.addCookies([{ name: "theme", value: theme, url: ORIGIN }]);
}

function collectProblems(page: Page) {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(m.text());
  });
  page.on("pageerror", (e) => problems.push(e.message));
  return problems;
}

for (const theme of ["light", "dark"] as const) {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    test(`no WCAG A/AA violations and no overflow – ${theme}, ${viewport.width}px`, async ({ browser }) => {
      const context = await browser.newContext({ viewport });
      await setThemeCookie(context, theme);
      const page = await context.newPage();
      const problems = collectProblems(page);
      for (const path of PAGES) {
        await page.goto(path);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
        expect(results.violations.map((v) => `${path}: ${v.id} (${v.nodes.length})`)).toEqual([]);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${path} overflows horizontally`).toBe(0);
      }
      expect(problems).toEqual([]);
      await context.close();
    });
  }
}

test("theme is server-rendered from the cookie (no flash) and pages contain no inline styles", async ({ request }) => {
  const dark = await (await request.get("/design-system", { headers: { Cookie: "theme=dark" } })).text();
  expect(dark).toMatch(/<html lang="en" data-theme="dark"/);
  const system = await (await request.get("/design-system")).text();
  expect(system).toMatch(/<html lang="en">/);
  for (const html of [dark, system]) {
    expect(html).not.toMatch(/\sstyle="/);
  }
  const bogus = await (await request.get("/", { headers: { Cookie: "theme=%3Cscript%3E" } })).text();
  expect(bogus).toMatch(/<html lang="en">/);
});

test("theme switch with JavaScript updates in place and persists", async ({ page, context }) => {
  const problems = collectProblems(page);
  await page.goto("/design-system");
  await page.getByRole("button", { name: "Dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Dark theme" })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await context.cookies()).find((c) => c.name === "theme")?.value).toBe("dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.getByRole("button", { name: "Use system setting" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
  await expect.poll(async () => (await context.cookies()).find((c) => c.name === "theme")).toBeUndefined();
  expect(problems).toEqual([]);
});

test("theme switch works without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByRole("button", { name: "Light theme" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await context.close();
});

test("theme endpoint rejects invalid values and GET requests", async ({ request }) => {
  const invalid = await request.post("/theme", { form: { theme: "neon", redirectTo: "/" }, maxRedirects: 0 });
  expect(invalid.status()).toBe(400);
  const get = await request.get("/theme", { maxRedirects: 0 });
  expect(get.status()).toBe(302);
});

test("fonts are self-hosted: no third-party requests, Source Sans 3 is loaded", async ({ page }) => {
  const foreign: string[] = [];
  page.on("request", (r) => {
    if (!r.url().startsWith(ORIGIN) && !r.url().startsWith("data:")) foreign.push(r.url());
  });
  await page.goto("/design-system");
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('16px "Source Sans 3"'))).toBe(true);
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain("Source Sans 3");
  expect(foreign).toEqual([]);
});

test("mobile navigation menu works without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto("/");
  const menu = page.locator("summary", { hasText: "Menu" });
  const menuLink = page.locator("details").filter({ has: menu }).getByRole("link", { name: "Discover" });
  await expect(menuLink).toBeHidden();
  await menu.click();
  await expect(menuLink).toBeVisible();
  await menuLink.click();
  await expect(page).toHaveURL(/\/discover$/);
  // The design system reference is linked only in the development server (WP 8.9).
  await expect(page.getByRole("link", { name: "Design system", exact: true })).toHaveCount(0);
  await context.close();
});
