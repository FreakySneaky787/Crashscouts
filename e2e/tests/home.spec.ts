/**
 * Home page and brand (WP 8.9, ADR 0035): visitors learn what the platform is and find both
 * entry points; signed-in people get their next steps; shared links carry a preview image.
 */
import { expect, test } from "@playwright/test";

import { createSignedInAccount } from "./helpers";

test("visitors see what Crashscouts is and both ways in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Real testers for your open-source project" })).toBeVisible();
  await expect(page.getByRole("link", { name: "I need testers" })).toHaveAttribute("href", "/signup");
  await expect(page.getByRole("link", { name: "I want to test" })).toHaveAttribute("href", "/discover?tab=campaigns");
  await expect(page.getByRole("heading", { level: 2, name: "How it works" })).toBeVisible();
  await expect(page.getByRole("list").filter({ hasText: "Publish a campaign" }).locator(":scope > li")).toHaveCount(3);
  // Public campaigns are still locked here, so the panel explains instead of showing nothing.
  await expect(page.getByText("The first campaigns are on their way")).toBeVisible();
  await expect(page.getByText("Early development build")).toHaveCount(0);
});

test("shared links get a title, a description and a preview image", async ({ page, request }) => {
  await page.goto("/");
  const og = (property: string) => page.locator(`meta[property="${property}"]`);
  await expect(og("og:title")).toHaveAttribute("content", /Real testers for your open-source project/);
  await expect(og("og:description")).toHaveAttribute("content", /structured feedback/);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
  const image = await og("og:image").getAttribute("content");
  expect(new URL(image ?? "").pathname).toBe("/og-image.png");
  const png = await request.get(new URL(image ?? "").pathname);
  expect(png.status()).toBe(200);
  expect(png.headers()["content-type"]).toBe("image/png");

  // Discover too; the icons and the manifest load.
  await page.goto("/discover");
  await expect(og("og:image")).toHaveAttribute("content", /\/og-image\.png$/);
  for (const path of ["/favicon.svg", "/apple-touch-icon.png", "/icon-192.png", "/icon-512.png"]) {
    expect((await request.get(path)).status(), path).toBe(200);
  }
  const manifest = await request.get("/site.webmanifest");
  expect(manifest.status()).toBe(200);
  expect((await manifest.json()).name).toBe("Crashscouts");
});

test("the brand shows the logo, not a first letter", async ({ page }) => {
  await page.goto("/");
  const brand = page.locator("aside").getByText("Crashscouts", { exact: true });
  await expect(brand).toBeVisible();
  await expect(page.locator("aside svg").first()).toBeVisible();
  expect(await page.evaluate(() => document.fonts.check('800 16px "Bricolage Grotesque"'))).toBe(true);
});

test("signed-in people see their next steps", async ({ page, request }) => {
  const account = await createSignedInAccount(page, request);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: `Welcome back, ${account.username}` })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create a project" })).toHaveAttribute("href", "/projects/new");
  await expect(page.getByRole("heading", { name: "How it works" })).toHaveCount(0);
});
