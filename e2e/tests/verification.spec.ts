/**
 * WP 2.5 – Repository verification. No code host is ever contacted: the tests stop at the
 * redirect to github.com, use a forged state for the way back, and simulate a finished
 * verification directly in the database (test seed) to check the badge.
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { FRONTEND_URL } from "../playwright.config";

import { createProject, createSignedInAccount } from "./helpers";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function linkRepository(page: Page, slug: string, url: string) {
  await page.goto(`/p/${slug}/edit`);
  await page.getByRole("textbox", { name: "Repository", exact: true }).fill(url);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(new RegExp(`/p/${slug}$`));
}

/** Marks the project as verified in the database, as a successful check would. */
function seedVerified(slug: string) {
  const script = [
    "import os",
    "from django.utils import timezone",
    "from apps.projects.models import Project",
    "from apps.projects.verification import challenge_for",
    "project = Project.objects.get(slug=os.environ['E2E_SLUG'])",
    "row = challenge_for(project)",
    "row.method = 'file'",
    "row.verified_at = timezone.now()",
    "row.save()",
  ].join("\n");
  execFileSync("uv", ["run", "--env-file", "../.env", "python", "manage.py", "shell", "-c", script], {
    cwd: "../backend",
    env: { ...process.env, E2E_SLUG: slug },
    stdio: "pipe",
  });
}

test("the team gets check-file instructions; unsupported links are explained", async ({ page, request }) => {
  await createSignedInAccount(page, request);
  const slug = await createProject(page); // links https://example.test/…: not a supported host

  await page.goto(`/p/${slug}/edit`);
  const panel = page.getByRole("region", { name: "Repository verification" });
  await expect(panel.getByText("Add a link to a public repository")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Check now" })).toHaveCount(0);

  await linkRepository(page, slug, `https://github.com/e2e-${randomBytes(3).toString("hex")}/tidewater`);
  await page.goto(`/p/${slug}/edit`);
  await expect(panel.getByTestId("verification-filename")).toHaveText(/^\.[a-z0-9-]+-verification$/);
  const code = (await panel.getByTestId("verification-code").textContent()) ?? "";
  expect(code.length).toBeGreaterThanOrEqual(32);
  await expect(panel.getByRole("button", { name: "Check now" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Confirm with GitHub" })).toBeVisible();

  // The code is only for the team: it is not part of the public page.
  await page.goto(`/p/${slug}`);
  await expect(page.locator("body")).not.toContainText(code);
  await expect(page.getByText("Repository verified")).toHaveCount(0);
});

test("confirming with GitHub starts at GitHub without scopes, also without JavaScript", async ({ browser, request }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await createSignedInAccount(page, request);
  const slug = await createProject(page);
  await linkRepository(page, slug, "https://github.com/e2e-owner/tidewater");
  await page.goto(`/p/${slug}/edit`);

  // The form POST really reaches the SSR server and Django; only the redirect to GitHub is caught.
  let target: URL | null = null;
  await page.route(`**/p/${slug}/edit*`, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch({ maxRedirects: 0 });
    target = new URL(response.headers()["location"] ?? "about:blank");
    await route.fulfill({ status: 200, contentType: "text/plain", body: "Redirect to GitHub captured by the test." });
  });
  await page.getByRole("button", { name: "Confirm with GitHub" }).click();
  await expect.poll(() => target?.href ?? "").not.toBe("");
  const url = target!;
  expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
  expect(url.searchParams.get("client_id")).toBe("e2e-dummy-client-id");
  expect(url.searchParams.get("redirect_uri")).toBe(`${FRONTEND_URL}/projects/github/verify/callback`);
  expect(url.searchParams.get("scope")).toBe("");
  expect(url.searchParams.get("state")).toBeTruthy();
  await context.close();
});

test("a forged state on the way back from GitHub is rejected", async ({ page, request }) => {
  await createSignedInAccount(page, request);
  await page.goto("/projects/github/verify/callback?code=forged&state=forged");
  await expect(page).toHaveURL(/\/account\?verification_error=invalid_state$/);
  await expect(page.getByRole("alert")).toContainText("The confirmation expired or does not belong to this session.");
});

test("a verified project shows the badge until the repository link changes", async ({ page, request, browser }) => {
  await createSignedInAccount(page, request);
  const slug = await createProject(page);
  await linkRepository(page, slug, "https://codeberg.org/e2e-owner/tidewater");
  seedVerified(slug);

  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  await visitor.goto(`/p/${slug}`);
  await expect(visitor.getByText("Repository verified")).toBeVisible();
  await expect(visitor.getByText("The team has shown that it controls the linked repository.")).toBeVisible();
  const results = await new AxeBuilder({ page: visitor }).withTags(WCAG).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);

  await page.goto(`/p/${slug}/edit`);
  const panel = page.getByRole("region", { name: "Repository verification" });
  await expect(panel.getByText("Verified with the check file in the Codeberg repository.")).toBeVisible();
  const edit = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(edit.violations.map((v) => v.id)).toEqual([]);

  await linkRepository(page, slug, "https://codeberg.org/e2e-owner/other");
  await visitor.reload();
  await expect(visitor.getByText("Repository verified")).toHaveCount(0);
  await visitorContext.close();
});
