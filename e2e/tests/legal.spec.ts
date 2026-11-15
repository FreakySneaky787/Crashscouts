/**
 * WP 8.5 – Legal texts (ADR 0031): footer links on every page, the signup notice, the draft
 * notice, placeholders instead of operator data in development, works without JavaScript, no
 * WCAG A/AA violations in light and dark, no sideways scrolling on narrow screens.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const PAGES = [
  { link: "Privacy policy", path: "/privacy", text: "Who is responsible" },
  { link: "Terms of use", path: "/terms", text: "What is not allowed" },
  { link: "Imprint", path: "/imprint", text: "Operator and responsible for the content" },
];

test("legal pages from the footer, as drafts with placeholders, accessible", async ({ page }) => {
  for (const { link, path, text } of PAGES) {
    await page.goto("/discover");
    await page.getByRole("navigation", { name: "Legal" }).getByRole("link", { name: link }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole("heading", { level: 1, name: link })).toBeVisible();
    await expect(page.getByText(text)).toBeVisible();
    await expect(page.getByText("Draft – not yet reviewed by a legal professional.")).toBeVisible();
  }
  // No operator data is configured here: visible placeholders, never empty lines.
  await page.goto("/imprint");
  await expect(page.getByText("[operator name – configured on the server]")).toBeVisible();
  // The source code link appears only once a public address is configured (SOURCE_CODE_URL).
  await expect(page.getByRole("link", { name: "Source code (AGPL-3.0)" })).toHaveCount(0);

  await page.goto("/privacy");
  const light = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(light.violations.map((v) => v.id)).toEqual([]);
  await page.getByRole("button", { name: "Dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Dark theme" })).toHaveAttribute("aria-pressed", "true");
  const dark = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(dark.violations.map((v) => v.id)).toEqual([]);
  await page.setViewportSize({ width: 390, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("the signup form points to the terms and the privacy policy", async ({ page }) => {
  await page.goto("/signup");
  await page.getByRole("link", { name: "Terms of use" }).first().click();
  await expect(page).toHaveURL(/\/terms$/);
  await page.goto("/signup");
  await page.getByRole("main").getByRole("link", { name: "Privacy policy" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
});

test("legal pages work without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  for (const { path, text } of PAGES) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByText(text)).toBeVisible();
  }
  await context.close();
});
