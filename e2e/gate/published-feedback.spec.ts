/**
 * WP 5.5 – Published feedback (ADR 0024), in the security-gate run because it needs a public
 * campaign: the team proposes, the author consents, and only then can visitors read the text –
 * never the files and never who wrote it. Either side can make it private again.
 */
import { randomBytes } from "node:crypto";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { createProject, createSignedInAccount, enableTotp } from "../tests/helpers";

import { approve, publicCampaign, signedInModerator } from "./helpers";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test("published feedback: proposed by the team, consented by the author, private again", async ({ page, request, browser }) => {
  test.setTimeout(120_000);
  const title = `Open beta ${randomBytes(3).toString("hex")}`;
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

  // A tester joins and gives feedback with a log file.
  const testerContext = await browser.newContext();
  const tester = await testerContext.newPage();
  await createSignedInAccount(tester, request);
  await tester.goto(campaign);
  await tester.getByRole("button", { name: "Join campaign" }).click();
  await expect(tester.getByText("You take part in this campaign now.")).toBeVisible();
  await tester.goto(`${campaign}/feedback/new?kind=ux`);
  await tester.getByLabel("Title").fill("The settings are hard to find");
  await tester.getByLabel("Description").fill("I looked for the theme switch for a while.");
  await tester.getByLabel("Where in the product (optional)").fill("Main menu");
  await tester.getByRole("button", { name: "Send feedback" }).click();
  await expect(tester.getByText("Thank you. Your feedback was sent.")).toBeVisible();
  const feedback = new URL(tester.url()).pathname;
  const files = tester.getByRole("region", { name: "Screenshots and logs" });
  await files.getByLabel("File", { exact: true }).setInputFiles({ name: "ui.log", mimeType: "text/plain", buffer: Buffer.from("menu opened\n") });
  await files.getByRole("button", { name: "Add file" }).click();
  await expect(files.getByRole("link", { name: "Download ui.log" })).toBeVisible();
  const fileHref = (await files.getByRole("link", { name: "Download ui.log" }).getAttribute("href")) ?? "";

  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  expect((await visitor.goto(feedback))?.status()).toBe(404); // private for now

  // The team proposes; still private until the author agrees.
  await page.goto(feedback);
  await page.getByRole("button", { name: "Propose to make it public" }).click();
  await expect(page.getByText("Waiting for the author's consent to make it public.")).toBeVisible();
  expect((await visitor.goto(feedback))?.status()).toBe(404);

  // The author consents: visitors read the text, not the files and not the author.
  await tester.goto(feedback);
  await tester.getByRole("button", { name: "Make it public" }).click();
  await expect(tester.getByText("The feedback is public now.")).toBeVisible();
  await visitor.goto(campaign);
  await visitor.getByRole("region", { name: "Feedback" }).getByRole("link", { name: "The settings are hard to find" }).click();
  await expect(visitor.getByText("I looked for the theme switch for a while.")).toBeVisible();
  await expect(visitor.getByText("A tester")).toBeVisible();
  await expect(visitor.getByText("This feedback is public")).toBeVisible();
  await expect(visitor.getByRole("region", { name: "Screenshots and logs" })).toHaveCount(0);
  expect((await visitor.request.get(fileHref)).status()).toBe(404);
  const results = await new AxeBuilder({ page: visitor }).withTags(WCAG).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);

  // The author makes it private again.
  await tester.goto(feedback);
  await tester.getByRole("button", { name: "Make it private again" }).click();
  await expect(tester.getByText("The feedback is private again.")).toBeVisible();
  expect((await visitor.goto(feedback))?.status()).toBe(404);

  for (const context of [modContext, testerContext, visitorContext]) await context.close();
});
