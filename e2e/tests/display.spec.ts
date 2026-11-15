/**
 * WP 8.6 part C – motion and zoom (docs/ACCESSIBILITY.md).
 * - "Reduce motion" in the system settings switches transitions off (WCAG 2.3.3).
 * - 320 CSS px wide, which a 1280 px window shows at 400 % zoom: no horizontal scrolling and the
 *   page heading stays visible (WCAG 1.4.10 Reflow).
 * - Text at 200 % (the font sizes are in rem): no horizontal scrolling, nothing is cut off at the
 *   side (WCAG 1.4.4 Resize Text).
 */
import { expect, test, type Page } from "@playwright/test";

import { createProject, createSignedInAccount } from "./helpers";

const PUBLIC = ["/", "/discover", "/login", "/signup", "/password/forgot", "/privacy", "/design-system"];

test("transitions follow the system setting to reduce motion", async ({ browser }) => {
  const calm = await browser.newContext({ reducedMotion: "reduce" });
  const calmPage = await calm.newPage();
  await calmPage.goto("/design-system");
  const reduced = await calmPage.evaluate(() =>
    [...document.querySelectorAll("button, a")].map((el) => getComputedStyle(el).transitionDuration),
  );
  expect(reduced.every((d) => d.split(",").every((part) => parseFloat(part) === 0))).toBe(true);
  await calm.close();

  // Without the setting the buttons keep their short transition, so the check above means something.
  const normal = await browser.newContext({ reducedMotion: "no-preference" });
  const normalPage = await normal.newPage();
  await normalPage.goto("/design-system");
  const durations = await normalPage.evaluate(() =>
    [...document.querySelectorAll("button")].map((el) => getComputedStyle(el).transitionDuration),
  );
  expect(durations.some((d) => d.split(",").some((part) => parseFloat(part) > 0))).toBe(true);
  await normal.close();
});

async function expectReflow(page: Page, path: string, problems: string[]) {
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) {
    problems.push(`${path}: scrolls horizontally`);
  }
}

test("pages reflow at 320 CSS px (400 % zoom)", async ({ page, request }) => {
  test.setTimeout(120_000);
  const problems: string[] = [];
  await page.setViewportSize({ width: 320, height: 640 });
  for (const path of PUBLIC) await expectReflow(page, path, problems);
  await createSignedInAccount(page, request);
  const project = await createProject(page);
  for (const path of ["/account", "/settings/profile", "/settings/security", `/p/${project}`, `/p/${project}/edit`, `/p/${project}/c/new`]) {
    await expectReflow(page, path, problems);
  }
  expect(problems).toEqual([]);
});

test("text at 200 % keeps every page readable without scrolling sideways", async ({ page }) => {
  const problems: string[] = [];
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const path of PUBLIC) {
    await page.goto(path);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) {
      problems.push(`${path}: scrolls horizontally with 200 % text`);
    }
  }
  expect(problems).toEqual([]);
});
