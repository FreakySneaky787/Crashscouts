/** WP 3B.2 – Reporting projects, campaigns and download links. */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { createProject, createSignedInAccount } from "./helpers";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function privateCampaignWithLink(page: Page, project: string) {
  await page.goto(`/p/${project}/c/new`);
  await page.getByLabel("Title").fill("Beta 1");
  await page.getByLabel("Short name").fill("beta-1");
  await page.getByLabel("Summary").fill("Try the new sync engine.");
  await page.getByLabel("Software version").fill("2.0.0-beta.1");
  await page.getByLabel("Start").fill("2027-03-01T09:00");
  await page.getByLabel("End").fill("2027-03-15T18:00");
  await page.getByLabel("Testers wanted").fill("5");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(new RegExp(`/c/beta-1$`));
  await page.goto(`/p/${project}/c/beta-1/edit`);
  const links = page.getByRole("region", { name: "Downloads" });
  await links.getByLabel("Label").fill("Linux AppImage");
  await links.getByLabel("Link", { exact: true }).fill("https://downloads.example.org/tidewater-2.0.AppImage");
  await links.getByRole("button", { name: "Add link" }).click();
  await expect(page.getByText("The link was added.")).toBeVisible();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page).toHaveURL(new RegExp(`/c/beta-1$`));
}

test("a participant reports a download link and a project", async ({ page, request, browser }) => {
  await createSignedInAccount(page, request);
  const project = await createProject(page);
  await privateCampaignWithLink(page, project);

  const testerContext = await browser.newContext();
  const tester = await testerContext.newPage();
  const account = await createSignedInAccount(tester, request);
  await page.goto(`/p/${project}/c/beta-1/testers`);
  await page.getByLabel("Username").fill(account.username);
  await page.getByRole("button", { name: "Invite" }).click();
  await expect(page.getByText("The invitation was sent.")).toBeVisible();
  await tester.goto("/account");
  await tester.getByRole("button", { name: "Accept the invitation to Beta 1" }).click();
  await expect(tester.getByText("You take part in the campaign now.")).toBeVisible();

  await tester.goto(`/p/${project}/c/beta-1`);
  await tester.getByRole("region", { name: "Downloads" }).getByRole("link", { name: "Linux AppImage" }).click();
  await tester.getByRole("link", { name: "Report this link" }).click();
  await expect(tester.getByText("Download link: Linux AppImage (downloads.example.org)")).toBeVisible();
  const results = await new AxeBuilder({ page: tester }).withTags(WCAG).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
  await tester.getByLabel("Reason").selectOption("malware");
  await tester.getByLabel("Details (optional)").fill("My virus scanner flagged the installer.");
  await tester.getByRole("button", { name: "Send report" }).click();
  await expect(tester).toHaveURL(new RegExp(`/p/${project}/c/beta-1\\?reported=1$`));
  await expect(tester.getByText("Thank you. Moderators will review your report.")).toBeVisible();

  // A second report of the same link is refused while the first is open.
  await tester.getByRole("region", { name: "Downloads" }).getByRole("link", { name: "Linux AppImage" }).click();
  await tester.getByRole("link", { name: "Report this link" }).click();
  await tester.getByRole("button", { name: "Send report" }).click();
  await expect(tester.getByRole("alert")).toContainText("You already reported this");

  await tester.goto(`/p/${project}`);
  await tester.getByRole("link", { name: "Report" }).click();
  await tester.getByLabel("Reason").selectOption("not_own_software");
  await tester.getByRole("button", { name: "Send report" }).click();
  await expect(tester.getByText("Thank you. Moderators will review your report.")).toBeVisible();

  await tester.goto("/account");
  const mine = tester.getByRole("list", { name: "Your reports" });
  await expect(mine.getByRole("listitem")).toHaveCount(2);
  await expect(mine).toContainText("Malware or dangerous download");
  await expect(mine).toContainText("Open");

  // The team gets no report button for its own content.
  await page.goto(`/p/${project}`);
  await expect(page.getByRole("link", { name: "Report" })).toHaveCount(0);
  await testerContext.close();
});

test("visitors are asked to sign in before reporting", async ({ page, request, browser }) => {
  await createSignedInAccount(page, request);
  const project = await createProject(page);
  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  await visitor.goto(`/p/${project}`);
  await visitor.getByRole("link", { name: "Report" }).click();
  await expect(visitor).toHaveURL(/\/login\?next=%2Freport/);
  expect((await visitor.goto("/report?type=project&project=..%2Fetc"))?.status()).toBe(404);
  await visitorContext.close();
});
