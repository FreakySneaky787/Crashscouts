/**
 * WP 3B.6 – Security gate item 8, the abuse case, end to end with public campaigns switched on
 * (playwright.gate.config.ts): a team submits a public campaign, a moderator reviews and approves
 * it, a tester joins and reports the download link, the moderator blocks the link; afterwards
 * the link is reachable for no one – not the tester, not the team, not through the API.
 */
import { randomBytes } from "node:crypto";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { BACKEND_URL } from "../playwright.config";
import { createProject, createSignedInAccount, enableTotp, setRole } from "../tests/helpers";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function publicCampaign(page: Page, project: string, title: string) {
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

/** The browser context's session, sent to Django directly (the API itself, without the SSR). */
async function apiStatus(context: BrowserContext, path: string): Promise<number> {
  const cookies = (await context.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
  const response = await context.request.get(`${BACKEND_URL}${path}`, { headers: { Cookie: cookies } });
  return response.status();
}

test("abuse case: submit, review, approve, report the link, block; the link is gone", async ({ page, request, browser }) => {
  const suffix = randomBytes(3).toString("hex");
  const title = `Open beta ${suffix}`;
  const label = `Installer ${suffix}`;

  // 1. The team (rule A: confirmed email and 2FA) submits a public campaign with a link.
  const owner = await createSignedInAccount(page, request);
  await enableTotp(page, owner.password);
  const project = await createProject(page);
  await publicCampaign(page, project, title);
  const campaignPath = `/p/${project}/c/open-beta`;
  await page.goto(`${campaignPath}/edit`);
  const links = page.getByRole("region", { name: "Downloads" });
  await links.getByLabel("Label").fill(label);
  await links.getByLabel("Link", { exact: true }).fill(`https://downloads.example.org/installer-${suffix}.exe`);
  await links.getByRole("button", { name: "Add link" }).click();
  await expect(page.getByText("The link was added.")).toBeVisible();
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page).toHaveURL(new RegExp(`${campaignPath}$`));
  await expect(page.getByText("In review", { exact: true })).toBeVisible();

  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  expect((await visitor.goto(campaignPath))?.status()).toBe(404);

  // 2. A moderator (role from the server command, 2FA) reviews and approves it.
  const modContext = await browser.newContext();
  const mod = await modContext.newPage();
  const moderator = await createSignedInAccount(mod, request);
  await enableTotp(mod, moderator.password);
  setRole(moderator.username, "moderator");
  await mod.goto("/moderation");
  const review = mod.getByRole("list", { name: "Reviews" }).getByRole("listitem").filter({ hasText: title });
  await expect(review).toContainText(`${label}: https://downloads.example.org/installer-${suffix}.exe`);
  const queue = await new AxeBuilder({ page: mod }).withTags(WCAG).analyze();
  expect(queue.violations.map((v) => v.id)).toEqual([]);
  await review.getByRole("button", { name: "Approve" }).click();
  await expect(mod.getByText("Done.")).toBeVisible();
  await expect(mod.getByRole("list", { name: "Reviews" }).getByRole("listitem").filter({ hasText: title })).toHaveCount(0);
  expect((await visitor.goto(campaignPath))?.status()).toBe(200);
  await expect(visitor.getByRole("heading", { level: 1, name: title })).toBeVisible();

  // 3. A tester joins, reaches the download through the warning page and reports it.
  const testerContext = await browser.newContext();
  const tester = await testerContext.newPage();
  await createSignedInAccount(tester, request);
  await tester.goto(campaignPath);
  await tester.getByRole("button", { name: "Join campaign" }).click();
  await expect(tester.getByText("You take part in this campaign now.")).toBeVisible();
  await tester.getByRole("region", { name: "Downloads" }).getByRole("link", { name: label }).click();
  await expect(tester.getByRole("heading", { name: "This link leads to downloads.example.org" })).toBeVisible();
  const downloadPath = new URL(tester.url()).pathname;
  const linkId = downloadPath.split("/").pop() ?? "";
  const linkApi = `/api/v1/projects/${project}/campaigns/open-beta/links/${linkId}/`;
  expect(await apiStatus(testerContext, linkApi)).toBe(200);
  await tester.getByRole("link", { name: "Report this link" }).click();
  await tester.getByLabel("Reason").selectOption("malware");
  await tester.getByLabel("Details (optional)").fill("The installer contains a cryptominer.");
  await tester.getByRole("button", { name: "Send report" }).click();
  await expect(tester.getByText("Thank you. Moderators will review your report.")).toBeVisible();

  // 4. The moderator blocks the link.
  await mod.goto("/moderation");
  await mod.getByRole("list", { name: "Open cases" }).getByRole("link", { name: label }).click();
  await expect(mod.getByText("The installer contains a cryptominer.")).toBeVisible();
  await mod.getByLabel("Reason", { exact: true }).selectOption("malware");
  await mod.getByLabel("Message to the team").fill("The installer was reported as malware and is blocked.");
  await mod.getByLabel(/Block this content for everyone outside the team/).check();
  await mod.getByRole("button", { name: "Block", exact: true }).click();
  await expect(mod.getByText("Done.")).toBeVisible();

  // 5. The link is reachable for no one: not the tester, not the team, not through the API.
  expect((await tester.goto(downloadPath))?.status()).toBe(404);
  expect(await apiStatus(testerContext, linkApi)).toBe(404);
  expect((await page.goto(downloadPath))?.status()).toBe(404);
  expect(await apiStatus(page.context(), linkApi)).toBe(404);
  await page.goto(`${campaignPath}/edit`);
  await expect(page.getByRole("region", { name: "Downloads" }).getByText("Blocked by moderators")).toBeVisible();
  // The campaign itself stays available; only the link is blocked.
  expect((await visitor.goto(campaignPath))?.status()).toBe(200);
  // The reporter learns that the report was handled.
  await tester.goto("/account");
  await expect(tester.getByRole("list", { name: "Your reports" }).getByRole("listitem").filter({ hasText: label })).toContainText("Resolved");

  for (const context of [visitorContext, modContext, testerContext]) await context.close();
});
