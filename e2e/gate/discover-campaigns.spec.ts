/**
 * WP 6.3 – Discover lists live public test campaigns (security-gate run, public campaigns on):
 * a campaign appears only after the moderators approved it, and the campaign filters apply.
 */
import { randomBytes } from "node:crypto";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { createProject, createSignedInAccount, enableTotp } from "../tests/helpers";

import { approve, publicCampaign, signedInModerator } from "./helpers";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test("an approved public campaign can be found in Discover", async ({ page, request, browser }) => {
  test.setTimeout(90_000);
  const word = `zq${randomBytes(4).toString("hex")}`;
  const title = `Open beta ${word}`;
  const owner = await createSignedInAccount(page, request);
  await enableTotp(page, owner.password);
  const project = await createProject(page);
  await publicCampaign(page, project, title);
  await page.goto(`/p/${project}/c/open-beta/edit`);
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page).toHaveURL(new RegExp(`/p/${project}/c/open-beta$`));

  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  const search = `/discover?tab=campaigns&q=${word}`;
  await visitor.goto(search);
  await expect(visitor.getByText("No test campaigns match.")).toBeVisible(); // still in review

  const { context: modContext, mod } = await signedInModerator(browser, request);
  await approve(mod, title);
  // Anonymous Discover pages may be cached for 60 s (ADR 0025): ask for a fresh address.
  await visitor.goto(`${search}&sort=new`);
  const cards = visitor.getByRole("list", { name: "Test campaigns" }).locator(":scope > li");
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText(title);
  await expect(cards.first()).toContainText("Free testing");
  await expect(cards.first()).toContainText("0 of 5 places taken");
  const results = await new AxeBuilder({ page: visitor }).withTags(WCAG).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);

  // The campaign filters apply; the project tab counts the open campaign.
  await visitor.getByLabel("Testing method").selectOption({ label: "Structured testing" });
  await visitor.getByRole("button", { name: "Apply" }).click();
  await expect(visitor.getByText("No test campaigns match.")).toBeVisible();
  await visitor.goto(`/discover?has_campaign=1&q=Tidewater&sort=new`);
  await expect(visitor.getByRole("list", { name: "Projects" })).toContainText("1 open test campaign");
  for (const context of [modContext, visitorContext]) await context.close();
});
