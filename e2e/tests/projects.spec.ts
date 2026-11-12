/**
 * WP 2.2b – project pages: create, public page with link previews and safe Markdown,
 * private projects invisible, rename with redirect, team-only editing, owner-only deletion.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { FRONTEND_URL } from "../playwright.config";

import { createProject, createSignedInAccount } from "./helpers";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test("create a public project: server-rendered page with previews and safe Markdown", async ({ page, request }) => {
  await createSignedInAccount(page, request);
  const slug = await createProject(page);

  await expect(page.getByRole("heading", { level: 1, name: "Tidewater Sync" })).toBeVisible();
  await expect(page.getByText("Open source", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Features" })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();

  // What an anonymous visitor or a link preview bot receives.
  const html = await (await request.get(`/p/${slug}`)).text();
  expect(html).toContain('<meta property="og:title" content="Tidewater Sync"/>');
  expect(html).toContain('<meta property="og:description" content="Sync feeds between your devices."/>');
  expect(html).toContain(`<meta property="og:url" content="${FRONTEND_URL}/p/${slug}"/>`);
  expect(html).toContain('<meta name="robots" content="index, follow"/>');
  const main = html.slice(html.indexOf("<main"), html.indexOf("</main>"));
  expect(main).not.toMatch(/<script|<img|javascript:|tracker\.example/);
  expect(main).toContain('href="https://example.test/docs"');
});

test("private projects are invisible to everyone outside the team", async ({ page, request, browser }) => {
  await createSignedInAccount(page, request);
  const slug = await createProject(page, { visibility: "private" });
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");

  expect((await request.get(`/p/${slug}`)).status()).toBe(404);
  const stranger = await browser.newContext();
  const strangerPage = await stranger.newPage();
  await createSignedInAccount(strangerPage, request);
  const response = await strangerPage.goto(`/p/${slug}`);
  expect(response?.status()).toBe(404);
  expect((await strangerPage.goto(`/p/${slug}/edit`))?.status()).toBe(404);
  await stranger.close();
});

test("renaming keeps the old address working; strangers cannot edit public projects", async ({ page, request, browser }) => {
  await createSignedInAccount(page, request);
  const slug = await createProject(page);
  const renamed = `${slug}-new`;

  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("Short name").fill(renamed);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(new RegExp(`/p/${renamed}$`));

  const old = await request.get(`/p/${slug}`, { maxRedirects: 0 });
  expect(old.status()).toBe(301);
  expect(old.headers()["location"]).toBe(`/p/${renamed}`);

  const stranger = await browser.newContext();
  const strangerPage = await stranger.newPage();
  await createSignedInAccount(strangerPage, request);
  expect((await strangerPage.goto(`/p/${renamed}/edit`))?.status()).toBe(404);
  await expect(strangerPage.getByRole("link", { name: "Edit" })).toHaveCount(0);
  await stranger.close();
});

test("the owner deletes a project after confirming", async ({ page, request }) => {
  await createSignedInAccount(page, request);
  const slug = await createProject(page);
  await page.goto(`/p/${slug}/edit`);

  await page.getByRole("button", { name: "Delete project" }).click();
  await expect(page.getByRole("alert")).toContainText("Tick the box to confirm the deletion.");
  await page.getByLabel("Delete Tidewater Sync for good").check();
  await page.getByRole("button", { name: "Delete project" }).click();
  await expect(page).toHaveURL(/\/account\?project=deleted$/);
  await expect(page.getByRole("status")).toContainText("The project was deleted.");
  expect((await request.get(`/p/${slug}`)).status()).toBe(404);
});

test("creating a project works without JavaScript and shows field errors", async ({ browser, request }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await createSignedInAccount(page, request);
  await page.goto("/projects/new");
  await page.getByLabel("Name", { exact: true }).fill("No JS");
  await page.getByLabel("Short name").fill("new");
  await page.getByLabel("Summary").fill("Reserved short name.");
  await page.getByLabel("Repository").fill("http://insecure.example");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByText("This short name is reserved. Choose another one.")).toBeVisible();
  await expect(page.getByText("Enter a complete link that starts with https://.")).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("No JS");
  await context.close();
});

test("project pages have no WCAG A/AA violations in light and dark", async ({ page, request, context }) => {
  await createSignedInAccount(page, request);
  const slug = await createProject(page);
  for (const theme of ["light", "dark"]) {
    await context.addCookies([{ name: "theme", value: theme, url: FRONTEND_URL }]);
    for (const path of ["/projects/new", `/p/${slug}`, `/p/${slug}/edit`, "/account"]) {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
      expect(results.violations.map((v) => `${theme} ${path}: ${v.id}`)).toEqual([]);
    }
  }
});
