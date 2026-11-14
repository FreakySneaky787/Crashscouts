/**
 * WP 6.3 – Discover: search and filter public projects; open source is preselected, others appear
 * after choosing "All licences" and are labelled; private projects never appear; the campaigns
 * tab is empty while the gate is closed; works without JavaScript; no WCAG A/AA violations.
 */
import { randomBytes } from "node:crypto";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { createProject, createSignedInAccount } from "./helpers";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function rename(page: Page, slug: string, name: string, { licence = "", softwareType = "" } = {}) {
  await page.goto(`/p/${slug}/edit`);
  await page.getByLabel("Name", { exact: true }).fill(name);
  if (licence) await page.getByLabel("Licence").selectOption(licence);
  if (softwareType) await page.getByRole("group", { name: "Software type" }).getByLabel(softwareType).check();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(new RegExp(`/p/${slug}$`));
}

test("search and filter public projects; open source first, private never", async ({ page, request, browser }) => {
  test.setTimeout(90_000);
  const word = `zq${randomBytes(4).toString("hex")}`; // unique: the E2E database keeps earlier runs
  await createSignedInAccount(page, request);
  await rename(page, await createProject(page), `Lighthouse ${word}`, { softwareType: "Game" });
  await rename(page, await createProject(page), `Closedbox ${word}`, { licence: "LicenseRef-Proprietary" });
  await rename(page, await createProject(page, { visibility: "private" }), `Hidden ${word}`);

  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  await visitor.goto("/");
  await visitor.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Discover" }).click();
  await expect(visitor.getByRole("heading", { level: 1, name: "Discover" })).toBeVisible();

  // Search: the open-source project only (preselected), never the private one.
  await visitor.getByLabel("Search").fill(word);
  await visitor.getByRole("button", { name: "Apply" }).click();
  const results = visitor.getByRole("list", { name: "Projects" });
  const cards = results.locator(":scope > li"); // each card also holds its own small lists
  await expect(cards).toHaveCount(1);
  await expect(results).toContainText(`Lighthouse ${word}`);
  await expect(results).toContainText("Open source");
  const searched = await new AxeBuilder({ page: visitor }).withTags(WCAG).analyze();
  expect(searched.violations.map((v) => v.id)).toEqual([]);

  // All licences: the closed-source project appears, clearly labelled; still no private one.
  await visitor.getByLabel("Licence").selectOption({ label: "All licences" });
  await visitor.getByRole("button", { name: "Apply" }).click();
  await expect(cards).toHaveCount(2);
  await expect(cards.filter({ hasText: `Closedbox ${word}` })).toContainText("Not open source");
  await expect(visitor.getByText(`Hidden ${word}`)).toHaveCount(0);

  // Filters combine with the search; the address can be shared.
  await visitor.getByLabel("Software type").selectOption({ label: "Game" });
  await visitor.getByRole("button", { name: "Apply" }).click();
  await expect(cards).toHaveCount(1);
  await expect(results).toContainText(`Lighthouse ${word}`);
  expect(new URL(visitor.url()).searchParams.get("software_type")).toBe("game");
  await visitor.getByLabel("Software type").selectOption({ label: "Desktop app" });
  await visitor.getByRole("button", { name: "Apply" }).click();
  await expect(visitor.getByText("No projects match.")).toBeVisible();
  await visitor.getByRole("link", { name: "Reset all" }).click();
  await expect(visitor).toHaveURL(/\/discover$/);

  // The campaigns tab is empty while public campaigns are locked.
  await visitor.getByRole("navigation", { name: "Discover sections" }).getByRole("link", { name: "Test campaigns" }).click();
  await expect(visitor.getByText("Public test campaigns are not open yet.")).toBeVisible();

  // Narrow screens and dark mode.
  await visitor.setViewportSize({ width: 390, height: 800 });
  await visitor.goto(`/discover?q=${word}`);
  const narrow = await new AxeBuilder({ page: visitor }).withTags(WCAG).analyze();
  expect(narrow.violations.map((v) => v.id)).toEqual([]);
  expect(await visitor.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await visitor.getByRole("button", { name: "Dark theme" }).click();
  const dark = await new AxeBuilder({ page: visitor }).withTags(WCAG).analyze();
  expect(dark.violations.map((v) => v.id)).toEqual([]);
  await visitorContext.close();
});

test("Discover works without JavaScript and is not indexed when filtered", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/discover");
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  await page.getByLabel("Sort by").selectOption("new");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/sort=new/);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
  await context.close();
});
