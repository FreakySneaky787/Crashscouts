/**
 * WP 5.3 – Testers give and follow feedback: choose a type, fill its fields, add a screenshot and
 * a log, edit, withdraw; other participants read the text but not the files or the author;
 * strangers get 404; the account page lists one's own feedback.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type APIRequestContext, type Page } from "@playwright/test";

import { createProject, createSignedInAccount, png } from "./helpers";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function campaignWithTesters(page: Page, request: APIRequestContext, browser: Browser) {
  await createSignedInAccount(page, request);
  const project = await createProject(page);
  await page.goto(`/p/${project}/c/new`);
  await page.getByLabel("Title").fill("Beta 1");
  await page.getByLabel("Short name").fill("beta-1");
  await page.getByLabel("Summary").fill("Try the new sync engine.");
  await page.getByLabel("Software version").fill("2.0.0-beta.1");
  await page.getByLabel("Start").fill("2027-03-01T09:00");
  await page.getByLabel("End").fill("2027-03-15T18:00");
  await page.getByLabel("Testers wanted").fill("5");
  await page.getByLabel("Combined testing", { exact: true }).check();
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(new RegExp(`/c/beta-1$`));
  await page.goto(`/p/${project}/c/beta-1/edit`);
  const tasks = page.getByRole("region", { name: "Test tasks" });
  await tasks.getByRole("textbox", { name: "Task", exact: true }).fill("Import a file");
  await tasks.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByText("The task was added.")).toBeVisible();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page).toHaveURL(new RegExp(`/c/beta-1$`));

  const testers = [];
  for (let n = 0; n < 2; n++) {
    const context = await browser.newContext();
    const tester = await context.newPage();
    const account = await createSignedInAccount(tester, request);
    await page.goto(`/p/${project}/c/beta-1/testers`);
    await page.getByLabel("Username").fill(account.username);
    await page.getByRole("button", { name: "Invite" }).click();
    await expect(page.getByText("The invitation was sent.")).toBeVisible();
    await tester.goto("/account");
    await tester.getByRole("button", { name: "Accept the invitation to Beta 1" }).click();
    await expect(tester.getByText("You take part in the campaign now.")).toBeVisible();
    testers.push({ context, tester, account });
  }
  return { project, testers };
}

test("testers give feedback with files; others read the text only", async ({ page, request, browser }) => {
  test.setTimeout(120_000); // a whole campaign with two testers
  const { project, testers } = await campaignWithTesters(page, request, browser);
  const [{ tester }, { tester: other }] = testers;
  const campaign = `/p/${project}/c/beta-1`;

  // Choose the type, then fill its fields.
  await tester.goto(campaign);
  await tester.getByRole("link", { name: "Give feedback" }).click();
  const kinds = await new AxeBuilder({ page: tester }).withTags(WCAG).analyze();
  expect(kinds.violations.map((v) => v.id)).toEqual([]);
  await tester.getByRole("link", { name: "Bug report" }).click();
  await tester.getByLabel("Title").fill("Import crashes");
  await tester.getByLabel("Description").fill("The app **closes** when importing.");
  await tester.getByLabel("Steps to reproduce").fill("1. Open File\n2. Import a CSV");
  await tester.getByLabel("Expected behaviour").fill("The file is imported.");
  await tester.getByLabel("Actual behaviour").fill("The app closes.");
  await tester.getByLabel("Operating system or device (optional)").selectOption({ label: "Linux" });
  await expect(tester.getByLabel("Software version")).toHaveValue("2.0.0-beta.1");
  await tester.getByLabel("Test task (optional)").selectOption({ label: "Import a file" });
  const form = await new AxeBuilder({ page: tester }).withTags(WCAG).analyze();
  expect(form.violations.map((v) => v.id)).toEqual([]);
  await tester.getByRole("button", { name: "Send feedback" }).click();
  await expect(tester.getByText("Thank you. Your feedback was sent.")).toBeVisible();
  await expect(tester.getByRole("heading", { level: 1, name: "Import crashes" })).toBeVisible();
  await expect(tester.getByText("closes", { exact: true })).toBeVisible(); // Markdown rendered
  const feedbackUrl = new URL(tester.url()).pathname;

  // Files: a screenshot and a log; a disguised file is refused.
  const files = tester.getByRole("region", { name: "Screenshots and logs" });
  await files.getByLabel("File", { exact: true }).setInputFiles({ name: "screen.png", mimeType: "image/png", buffer: png(320, 200) });
  await files.getByRole("button", { name: "Add file" }).click();
  await expect(tester.getByText("The file was added.")).toBeVisible();
  await expect(files.getByRole("img", { name: "Screenshot screen.webp" })).toBeVisible();
  await files.getByLabel("File", { exact: true }).setInputFiles({ name: "app.log", mimeType: "text/plain", buffer: Buffer.from("ERROR import failed\n") });
  await files.getByRole("button", { name: "Add file" }).click();
  await expect(files.getByRole("link", { name: "Download app.log" })).toBeVisible();
  await files.getByLabel("File", { exact: true }).setInputFiles({ name: "evil.png", mimeType: "image/png", buffer: Buffer.from("<svg onload=alert(1)>") });
  await files.getByRole("button", { name: "Add file" }).click();
  await expect(tester.getByRole("alert")).toContainText("Upload a PNG, JPEG or WebP image");
  const logLink = files.getByRole("link", { name: "Download app.log" });
  const logHref = (await logLink.getAttribute("href")) ?? "";
  const download = await tester.request.get(logHref);
  expect(download.status()).toBe(200);
  expect(download.headers()["content-disposition"]).toBe('attachment; filename="app.log"');
  expect(download.headers()["content-type"]).toBe("text/plain; charset=utf-8");
  const detail = await new AxeBuilder({ page: tester }).withTags(WCAG).analyze();
  expect(detail.violations.map((v) => v.id)).toEqual([]);

  // Edit while "New".
  await tester.getByRole("link", { name: "Edit" }).click();
  await tester.getByLabel("Title").fill("Import of CSV files crashes");
  await tester.getByRole("button", { name: "Save changes" }).click();
  await expect(tester.getByText("Your changes were saved.")).toBeVisible();

  // The other tester reads the text, but not the files and not who wrote it.
  await other.goto(campaign);
  await other.getByRole("region", { name: "Feedback" }).getByRole("link", { name: "Import of CSV files crashes" }).click();
  await expect(other.getByText("The app closes.")).toBeVisible();
  await expect(other.getByText("A tester")).toBeVisible();
  await expect(other.getByRole("region", { name: "Screenshots and logs" })).toHaveCount(0);
  expect((await other.request.get(logHref)).status()).toBe(404);
  await expect(other.getByRole("link", { name: "Edit" })).toHaveCount(0);

  // Strangers get 404 for the feedback and its files.
  const strangerContext = await browser.newContext();
  const stranger = await strangerContext.newPage();
  await createSignedInAccount(stranger, request);
  expect((await stranger.goto(feedbackUrl))?.status()).toBe(404);
  expect((await stranger.request.get(logHref)).status()).toBe(404);

  // Account page lists it; a second feedback is withdrawn.
  await tester.goto("/account");
  await expect(tester.getByRole("list", { name: "Your feedback" })).toContainText("Import of CSV files crashes");
  await tester.goto(`${campaign}/feedback/new?kind=general`);
  await tester.getByLabel("Title").fill("Typo");
  await tester.getByLabel("Description").fill("Never mind.");
  await tester.getByRole("button", { name: "Send feedback" }).click();
  await expect(tester.getByText("Thank you. Your feedback was sent.")).toBeVisible();
  await tester.getByRole("button", { name: "Withdraw feedback" }).click();
  await expect(tester.getByRole("alert")).toContainText("Tick the box to confirm.");
  await tester.getByLabel("Withdraw “Typo” for good.").check();
  await tester.getByRole("button", { name: "Withdraw feedback" }).click();
  await expect(tester.getByText("Your feedback was withdrawn.")).toBeVisible();
  await expect(tester.getByRole("list", { name: "Your feedback" })).not.toContainText("Typo");

  for (const { context } of testers) await context.close();
  await strangerContext.close();
});

test("only participants can open the feedback form", async ({ page, request, browser }) => {
  test.setTimeout(90_000);
  const { project, testers } = await campaignWithTesters(page, request, browser);
  // The team does not give feedback on its own campaign.
  expect((await page.goto(`/p/${project}/c/beta-1/feedback/new`))?.status()).toBe(404);
  const strangerContext = await browser.newContext();
  const stranger = await strangerContext.newPage();
  await createSignedInAccount(stranger, request);
  expect((await stranger.goto(`/p/${project}/c/beta-1/feedback/new`))?.status()).toBe(404);
  for (const { context } of testers) await context.close();
  await strangerContext.close();
});
