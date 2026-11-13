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

test("download links sit behind a warning page that only the team can open", async ({ page, request, browser }) => {
  await createSignedInAccount(page, request);
  const project = await createProject(page);
  await createCampaign(page, project);
  await page.goto(`/p/${project}/c/beta-1/edit`);
  const links = page.getByRole("region", { name: "Downloads" });

  await links.getByLabel("Label").fill("Linux AppImage");
  await links.getByLabel("Link", { exact: true }).fill("https://192.168.1.10/app.AppImage");
  await links.getByRole("button", { name: "Add link" }).click();
  await expect(links.getByText("Enter a public https:// link without user name")).toBeVisible();

  const sha = "0123456789abcdef".repeat(4);
  await links.getByLabel("Link", { exact: true }).fill("https://downloads.example.org/tidewater-2.0.AppImage");
  await links.getByLabel("Operating system or device").selectOption("linux");
  await links.getByLabel("SHA-256 checksum (optional)").fill(sha.toUpperCase());
  await links.getByRole("button", { name: "Add link" }).click();
  await expect(page.getByText("The link was added.")).toBeVisible();

  await page.goto(`/p/${project}/c/beta-1`);
  await page.getByRole("region", { name: "Downloads" }).getByRole("link", { name: "Linux AppImage" }).click();
  await expect(page).toHaveURL(new RegExp(`/p/${project}/c/beta-1/download/[0-9a-f-]{36}$`));
  const warning = page.url();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This link leads to downloads.example.org");
  await expect(page.getByTestId("download-url")).toHaveText("https://downloads.example.org/tidewater-2.0.AppImage");
  await expect(page.getByTestId("download-sha256")).toHaveText("01234567 89abcdef 01234567 89abcdef 01234567 89abcdef 01234567 89abcdef");
  await expect(page.getByText("Not in a verified repository")).toBeVisible();
  const go = page.getByRole("link", { name: "Continue to downloads.example.org" });
  await expect(go).toHaveAttribute("href", "https://downloads.example.org/tidewater-2.0.AppImage");
  await expect(go).toHaveAttribute("rel", "noopener noreferrer nofollow ugc");
  // No automatic forwarding: after a while the browser is still on the warning page.
  await page.waitForTimeout(1500);
  expect(page.url()).toBe(warning);
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);

  const strangerContext = await browser.newContext();
  const stranger = await strangerContext.newPage();
  await createSignedInAccount(stranger, request);
  expect((await stranger.goto(warning))?.status()).toBe(404);
  const visitorContext = await browser.newContext();
  expect((await (await visitorContext.newPage()).goto(warning))?.status()).toBe(404);
  await strangerContext.close();
  await visitorContext.close();

  await page.goto(`/p/${project}/c/beta-1/edit`);
  await links.getByRole("button", { name: "Remove link “Linux AppImage”" }).click();
  await expect(page.getByText("The link was removed.")).toBeVisible();
  expect((await page.goto(warning))?.status()).toBe(404);
});

test("invite to a private campaign, accept, then see the downloads", async ({ page, request, browser }) => {
  await createSignedInAccount(page, request);
  const project = await createProject(page);
  await createCampaign(page, project);
  await page.goto(`/p/${project}/c/beta-1/edit`);
  const links = page.getByRole("region", { name: "Downloads" });
  await links.getByLabel("Label").fill("Linux AppImage");
  await links.getByLabel("Link", { exact: true }).fill("https://downloads.example.org/tidewater-2.0.AppImage");
  await links.getByRole("button", { name: "Add link" }).click();
  await expect(page.getByText("The link was added.")).toBeVisible();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page).toHaveURL(new RegExp(`/c/beta-1$`));

  const testerContext = await browser.newContext();
  const tester = await testerContext.newPage();
  const testerAccount = await createSignedInAccount(tester, request);
  expect((await tester.goto(`/p/${project}/c/beta-1`))?.status()).toBe(404); // not invited yet

  await page.getByRole("link", { name: "Testers" }).click();
  await page.getByLabel("Username").fill("no-such-user-here");
  await page.getByRole("button", { name: "Invite" }).click();
  await expect(page.getByRole("alert")).toContainText("There is no account with this username");
  await page.getByLabel("Username").fill(testerAccount.username);
  await page.getByRole("button", { name: "Invite" }).click();
  await expect(page.getByText("The invitation was sent.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Open invitations" })).toContainText(testerAccount.username);

  // Invited: the campaign is visible, the downloads are not.
  await tester.goto(`/p/${project}/c/beta-1`);
  await expect(tester.getByRole("heading", { level: 1, name: "Beta 1" })).toBeVisible();
  await expect(tester.getByRole("region", { name: "Downloads" })).toHaveCount(0);

  await tester.goto("/account");
  await tester.getByRole("button", { name: "Accept the invitation to Beta 1" }).click();
  await expect(tester.getByText("You take part in the campaign now.")).toBeVisible();
  await expect(tester.getByRole("list", { name: "Your campaigns" }).getByRole("link", { name: "Beta 1" })).toBeVisible();

  await tester.goto(`/p/${project}/c/beta-1`);
  await expect(tester.getByText("1 of 5 taken")).toBeVisible();
  await tester.getByRole("region", { name: "Downloads" }).getByRole("link", { name: "Linux AppImage" }).click();
  await expect(tester.getByTestId("download-host")).toHaveText("downloads.example.org");
  // Participants cannot manage the campaign.
  expect((await tester.goto(`/p/${project}/c/beta-1/testers`))?.status()).toBe(404);
  expect((await tester.goto(`/p/${project}/c/beta-1/edit`))?.status()).toBe(404);

  await page.reload();
  await expect(page.getByRole("list", { name: "Participants" })).toContainText(testerAccount.username);
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
  await testerContext.close();
});

test("participants leave; the team removes and removed people stay out", async ({ page, request, browser }) => {
  await createSignedInAccount(page, request);
  const project = await createProject(page);
  await createCampaign(page, project);
  await page.goto(`/p/${project}/c/beta-1/edit`);
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page).toHaveURL(new RegExp(`/c/beta-1$`));

  const testerContext = await browser.newContext();
  const tester = await testerContext.newPage();
  const account = await createSignedInAccount(tester, request);
  const inviteAndAccept = async () => {
    await page.goto(`/p/${project}/c/beta-1/testers`);
    await page.getByLabel("Username").fill(account.username);
    await page.getByRole("button", { name: "Invite" }).click();
    await expect(page.getByText("The invitation was sent.")).toBeVisible();
    await tester.goto("/account");
    await tester.getByRole("button", { name: "Accept the invitation to Beta 1" }).click();
    await expect(tester.getByText("You take part in the campaign now.")).toBeVisible();
  };

  await inviteAndAccept();
  await tester.goto(`/p/${project}/c/beta-1`);
  await tester.getByRole("button", { name: "Leave campaign" }).click();
  await expect(tester.getByRole("alert")).toContainText("Tick the box to confirm that you want to leave.");
  await tester.getByLabel(/I want to leave/).check();
  await tester.getByRole("button", { name: "Leave campaign" }).click();
  await expect(tester).toHaveURL(/\/account\?participation=left$/);
  await expect(tester.getByText("You left the campaign.")).toBeVisible();
  expect((await tester.goto(`/p/${project}/c/beta-1`))?.status()).toBe(404); // private: access ends

  await inviteAndAccept(); // a new invitation brings them back
  await page.goto(`/p/${project}/c/beta-1/testers`);
  const participants = page.getByRole("list", { name: "Participants" });
  await expect(participants.getByRole("link", { name: account.username })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
  await participants.getByLabel(new RegExp(`Remove ${account.username}`)).check();
  await participants.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("The participant was removed.")).toBeVisible();
  expect((await tester.goto(`/p/${project}/c/beta-1`))?.status()).toBe(404);

  await page.getByLabel("Username").fill(account.username);
  await page.getByRole("button", { name: "Invite" }).click();
  await expect(page.getByRole("alert")).toContainText("This person was removed from the campaign and cannot be invited again.");
  await testerContext.close();
});

test("the team builds application questions for a campaign with approval", async ({ page, request }) => {
  await createSignedInAccount(page, request);
  const project = await createProject(page);
  await page.goto(`/p/${project}/c/new`);
  await page.getByLabel("Title").fill("Open beta");
  await page.getByLabel("Short name").fill("open-beta");
  await page.getByLabel("Summary").fill("Apply to test the sync engine.");
  await page.getByLabel("Software version").fill("2.0.0-beta.2");
  await page.getByLabel("Start").fill("2027-03-01T09:00");
  await page.getByLabel("End").fill("2027-03-15T18:00");
  await page.getByLabel("Testers wanted").fill("5");
  await page.getByLabel("Public", { exact: true }).check();
  await page.getByLabel("Participation in public campaigns").selectOption("approval");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(new RegExp(`/p/${project}/c/open-beta$`));

  await page.goto(`/p/${project}/c/open-beta/edit`);
  const panel = page.getByRole("region", { name: "Application questions" });
  const list = panel.getByRole("list", { name: "Application questions" });
  await expect(list).toContainText("Short message to the team"); // default template
  await panel.getByRole("button", { name: "Device and operating system" }).click();
  await expect(list).toContainText("Which device and operating system will you test on?");

  await panel.getByLabel("Question", { exact: true }).fill("Which browser do you use?");
  await panel.getByLabel("Answer type").selectOption("single_choice");
  await panel.getByLabel("Choices").fill("Firefox\nChrome\nSafari");
  await panel.getByLabel("Applicants must answer this question").check();
  await panel.getByRole("button", { name: "Add question" }).click();
  await expect(list).toContainText("Firefox / Chrome / Safari");

  await panel.getByLabel("Question", { exact: true }).fill("Pick one");
  await panel.getByLabel("Answer type").selectOption("single_choice");
  await panel.getByLabel("Choices").fill("Only one");
  await panel.getByRole("button", { name: "Add question" }).click();
  await expect(panel.getByText("Give 2 to 10 different choices")).toBeVisible();

  await panel.getByRole("button", { name: "Remove the question “Short message to the team”" }).click();
  await expect(list).not.toContainText("Short message to the team");
  await expect(list.getByRole("listitem")).toHaveCount(2);
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});
