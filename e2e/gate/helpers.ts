/** Shared steps of the security-gate run (public campaigns switched on for this run only). */
import { expect, type Browser, type Page } from "@playwright/test";

import { createProject, createSignedInAccount, enableTotp, setRole } from "../tests/helpers";

export async function publicCampaign(page: Page, project: string, title: string) {
  await page.goto(`/p/${project}/c/new`);
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Short name").fill("open-beta");
  await page.getByLabel("Summary").fill("Help us test the new installer.");
  await page.getByLabel("Software version").fill("3.0.0-beta.1");
  await page.getByLabel("Start").fill("2027-03-01T09:00");
  await page.getByLabel("End").fill("2027-03-15T18:00");
  await page.getByLabel("Testers wanted").fill("5");
  await page.getByLabel("Public", { exact: true }).check();
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(new RegExp(`/p/${project}/c/open-beta$`));
}

/** A moderator (role from the server command, 2FA) signs in; returns their page. */
export async function signedInModerator(browser: Browser, request: Parameters<typeof createSignedInAccount>[1]) {
  const context = await browser.newContext();
  const mod = await context.newPage();
  const moderator = await createSignedInAccount(mod, request);
  await enableTotp(mod, moderator.password);
  setRole(moderator.username, "moderator");
  return { context, mod };
}

/** The moderator approves the campaign with this title in the review queue. */
export async function approve(mod: Page, title: string) {
  await mod.goto("/moderation");
  const review = mod.getByRole("list", { name: "Reviews" }).getByRole("listitem").filter({ hasText: title });
  await review.getByRole("button", { name: "Approve" }).click();
  await expect(mod.getByText("Done.")).toBeVisible();
}

/**
 * A live public campaign with one published feedback (WP 5.5 steps): the owner's page, the
 * tester (author), a signed-in moderator and the feedback's path.
 */
export async function publishedFeedbackScene(page: Page, browser: Browser, request: Parameters<typeof createSignedInAccount>[1], feedbackTitle: string) {
  const title = `Open beta ${feedbackTitle.slice(-6)}`;
  const owner = await createSignedInAccount(page, request);
  await enableTotp(page, owner.password);
  const project = await createProject(page);
  await publicCampaign(page, project, title);
  const campaign = `/p/${project}/c/open-beta`;
  await page.goto(`${campaign}/edit`);
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page).toHaveURL(new RegExp(`${campaign}$`));
  const { context: modContext, mod } = await signedInModerator(browser, request);
  await approve(mod, title);

  const testerContext = await browser.newContext();
  const tester = await testerContext.newPage();
  await createSignedInAccount(tester, request);
  await tester.goto(campaign);
  await tester.getByRole("button", { name: "Join campaign" }).click();
  await expect(tester.getByText("You take part in this campaign now.")).toBeVisible();
  await tester.goto(`${campaign}/feedback/new?kind=general`);
  await tester.getByLabel("Title").fill(feedbackTitle);
  await tester.getByLabel("Description").fill("Visit my shop for cheap licences.");
  await tester.getByRole("button", { name: "Send feedback" }).click();
  await expect(tester.getByText("Thank you. Your feedback was sent.")).toBeVisible();
  const feedback = new URL(tester.url()).pathname;
  await page.goto(feedback);
  await page.getByRole("button", { name: "Propose to make it public" }).click();
  await expect(page.getByText("Waiting for the author's consent to make it public.")).toBeVisible();
  await tester.goto(feedback);
  await tester.getByRole("button", { name: "Make it public" }).click();
  await expect(tester.getByText("The feedback is public now.")).toBeVisible();
  return { feedback, tester, mod, contexts: [modContext, testerContext] };
}
