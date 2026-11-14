/** Shared steps of the security-gate run (public campaigns switched on for this run only). */
import { expect, type Browser, type Page } from "@playwright/test";

import { createSignedInAccount, enableTotp, setRole } from "../tests/helpers";

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
