/**
 * WP 3A.2 – Campaigns in the UI: create (with time zone), publish, complete, cancel, delete;
 * the public-campaign lock is visible and enforced; strangers get 404; works without JavaScript.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { FRONTEND_URL } from "../playwright.config";

import { createProject, createSignedInAccount } from "./helpers";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function createCampaign(
  page: Page,
  project: string,
  { slug = "beta-1", visibility = "private", zone = "America/New_York", ends = "2027-03-15T18:00", expectError = false } = {},
) {
  await page.goto(`/p/${project}/c/new`);
  await page.getByLabel("Title").fill("Beta 1");
  await page.getByLabel("Short name").fill(slug);
  await page.getByLabel("Summary").fill("Try the new sync engine.");
  await page.getByLabel("Software version").fill("2.0.0-beta.1");
  await page.getByLabel("Description").fill("## What is new\n\n- Faster sync");
  await page.getByLabel("Start").fill("2027-03-01T09:00");
  await page.getByLabel("End").fill(ends);
  await page.getByLabel("Time zone").selectOption(zone);
  await page.getByLabel("Testers wanted").fill("5");
  await page.getByRole("group", { name: "Operating systems and devices" }).getByLabel("Linux").check();
  await page.getByLabel(visibility === "public" ? "Public" : "Private", { exact: true }).check();
  await page.getByRole("button", { name: "Create draft" }).click();
  // Wait for the result itself, not just the click (otherwise the next step can race the POST).
  if (expectError) await expect(page.getByRole("alert").first()).toBeVisible();
  else await expect(page).toHaveURL(new RegExp(`/p/${project}/c/${slug}$`));
}

test("the team creates, publishes and completes a private campaign", async ({ page, request }) => {
  await createSignedInAccount(page, request);
  const project = await createProject(page);
  await createCampaign(page, project);
  await expect(page).toHaveURL(new RegExp(`/p/${project}/c/beta-1$`));
  await expect(page.getByRole("heading", { level: 1, name: "Beta 1" })).toBeVisible();
  await expect(page.getByText("This campaign is a draft. Only your team can see it.")).toBeVisible();
  // Shown in the campaign's own time zone, as entered.
  await expect(page.getByText("1 Mar 2027, 09:00")).toBeVisible();
  await expect(page.getByText("America/New_York")).toBeVisible();
  await expect(page.getByText("0 of 5 taken")).toBeVisible();

  await page.goto(`/p/${project}`);
  const list = page.getByRole("list", { name: "Campaigns" });
  await expect(list.getByRole("link", { name: "Beta 1" })).toBeVisible();
  await expect(list.getByText("Draft")).toBeVisible();

  await page.goto(`/p/${project}/c/beta-1/edit`);
  await expect(page.getByLabel("Start")).toHaveValue("2027-03-01T09:00"); // round trip in the zone
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page).toHaveURL(new RegExp(`/p/${project}/c/beta-1$`));
  await expect(page.getByText("Open", { exact: true })).toBeVisible();

  await page.goto(`/p/${project}/c/beta-1/edit`);
  await expect(page.getByRole("radio", { name: "Public" })).toHaveCount(0); // frozen after publishing
  await page.getByLabel("Title").fill("Beta 1 (sync)");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("The campaign was saved.")).toBeVisible();
  await page.getByRole("button", { name: "Complete campaign" }).click();
  await expect(page.getByText("Completed", { exact: true })).toBeVisible();
  await page.goto(`/p/${project}/c/beta-1/edit`);
  await expect(page.getByText("Completed and cancelled campaigns can no longer be edited.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0);
});

test("public campaigns stay drafts while the gate is closed", async ({ page, request }) => {
  await createSignedInAccount(page, request);
  const project = await createProject(page);
  await createCampaign(page, project, { visibility: "public" });
  await expect(page.getByText(/Public campaigns cannot be published yet/)).toBeVisible();
  await page.goto(`/p/${project}/c/beta-1/edit`);
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("alert")).toContainText("Public campaigns cannot be published yet. Make the campaign private");
  await page.goto(`/p/${project}/c/beta-1`);
  await expect(page.getByText("Draft", { exact: true })).toBeVisible();
});

test("strangers and visitors get 404 for drafts and private campaigns", async ({ page, request, browser }) => {
  await createSignedInAccount(page, request);
  const project = await createProject(page);
  await createCampaign(page, project, { slug: "draft-one" });
  await createCampaign(page, project, { slug: "private-one" });
  await page.goto(`/p/${project}/c/private-one/edit`);
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page).toHaveURL(new RegExp(`/c/private-one$`));

  const strangerContext = await browser.newContext();
  const stranger = await strangerContext.newPage();
  await createSignedInAccount(stranger, request);
  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  for (const path of [`/p/${project}/c/draft-one`, `/p/${project}/c/private-one`, `/p/${project}/c/private-one/edit`, `/p/${project}/c/new`]) {
    expect((await stranger.goto(path))?.status(), path).toBe(404);
  }
  for (const path of [`/p/${project}/c/draft-one`, `/p/${project}/c/private-one`]) {
    expect((await visitor.goto(path))?.status(), path).toBe(404);
  }
  // Pages that need an account send visitors to the login first (as for projects).
  await visitor.goto(`/p/${project}/c/private-one/edit`);
  await expect(visitor).toHaveURL(/\/login\?next=/);
  for (const who of [stranger, visitor]) {
    await who.goto(`/p/${project}`);
    await expect(who.getByRole("list", { name: "Campaigns" })).toHaveCount(0);
    await expect(who.getByRole("link", { name: "New campaign" })).toHaveCount(0);
  }
  await strangerContext.close();
  await visitorContext.close();
});

test("invalid input, cancelling and deleting need care", async ({ page, request }) => {
  await createSignedInAccount(page, request);
  const project = await createProject(page);
  await createCampaign(page, project, { ends: "2027-02-01T09:00", expectError: true });
  await expect(page.getByText("The end must be after the start.")).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveValue("Beta 1"); // entries are kept

  await page.getByLabel("End").fill("2027-03-15T18:00");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/c\/beta-1$/);

  await page.goto(`/p/${project}/c/beta-1/edit`);
  await page.getByRole("button", { name: "Cancel campaign" }).click();
  await expect(page.getByRole("alert")).toContainText("Tick the box to confirm the cancellation.");
  await page.getByRole("button", { name: "Delete draft" }).click();
  await expect(page.getByRole("alert")).toContainText("Tick the box to confirm the deletion.");
  await page.getByLabel(/I want to delete the draft/).check();
  await page.getByRole("button", { name: "Delete draft" }).click();
  await expect(page).toHaveURL(new RegExp(`/p/${project}\\?campaign=deleted$`));
  await expect(page.getByText("The draft was deleted.")).toBeVisible();
  expect((await page.goto(`/p/${project}/c/beta-1`))?.status()).toBe(404);
});

test("campaigns work without JavaScript", async ({ browser, request }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await createSignedInAccount(page, request);
  const project = await createProject(page);
  await createCampaign(page, project, { zone: "Europe/Zurich" });
  await expect(page).toHaveURL(new RegExp(`/p/${project}/c/beta-1$`));
  await expect(page.getByText("1 Mar 2027, 09:00")).toBeVisible();
  await context.close();
});

test("campaign pages have no WCAG A/AA violations in light and dark", async ({ page, request, context }) => {
  await createSignedInAccount(page, request);
  const project = await createProject(page);
  await createCampaign(page, project);
  for (const theme of ["light", "dark"]) {
    await context.addCookies([{ name: "theme", value: theme, url: FRONTEND_URL }]);
    for (const path of [`/p/${project}/c/new`, `/p/${project}/c/beta-1`, `/p/${project}/c/beta-1/edit`, `/p/${project}`]) {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
      expect(results.violations.map((v) => `${theme} ${path}: ${v.id}`)).toEqual([]);
    }
  }
});
