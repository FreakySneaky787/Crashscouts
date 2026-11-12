/** Shared E2E helpers: unique test accounts, reading emails from Mailpit, signing in. */
import { randomBytes } from "node:crypto";

import { expect, type APIRequestContext, type Page } from "@playwright/test";

import { FRONTEND_URL, MAILPIT_URL } from "../playwright.config";

export type MailpitSearch = { messages: { ID: string; Subject: string }[] };

/** Unique per test run: no fixed test data, no collisions with earlier runs. */
export function newAccount() {
  const id = randomBytes(5).toString("hex");
  return {
    email: `e2e-${id}@example.test`,
    username: `e2e-${id}`,
    password: randomBytes(18).toString("base64url"),
  };
}

/** Waits for the newest email to an address and returns the frontend link in it. */
export async function linkFromMail(request: APIRequestContext, to: string, route: string): Promise<string> {
  let link = "";
  await expect
    .poll(
      async () => {
        const search = (await (
          await request.get(`${MAILPIT_URL}/api/v1/search`, { params: { query: `to:${to}` } })
        ).json()) as MailpitSearch;
        if (search.messages.length === 0) return "";
        const message = (await (await request.get(`${MAILPIT_URL}/api/v1/message/${search.messages[0].ID}`)).json()) as {
          Text: string;
        };
        const match = message.Text.match(new RegExp(`${FRONTEND_URL}/${route}/\\S+`));
        link = match ? match[0] : "";
        return link;
      },
      { timeout: 15_000 },
    )
    .not.toBe("");
  return link;
}

export async function signUp(page: Page, account: ReturnType<typeof newAccount>) {
  await page.goto("/signup");
  await page.getByLabel("Email address").fill(account.email);
  await page.getByLabel("Username").fill(account.username);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByLabel("I am at least 16 years old.").check();
  await page.getByRole("button", { name: "Create account" }).click();
}

export async function logIn(page: Page, email: string, password: string) {
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}


/** Signs up, confirms the email and logs in; the page ends on /account. */
export async function createSignedInAccount(page: Page, request: APIRequestContext) {
  const account = newAccount();
  await signUp(page, account);
  await expect(page).toHaveURL(/\/signup\/check-email$/);
  await page.goto(await linkFromMail(request, account.email, "verify-email"));
  await page.getByRole("button", { name: "Confirm email address" }).click();
  await expect(page).toHaveURL(/\/login\?verified=1$/);
  await logIn(page, account.email, account.password);
  await expect(page).toHaveURL(/\/account$/);
  return account;
}

export const DESCRIPTION = [
  "## Features",
  "",
  "- Offline first",
  "",
  "<script>window.__xss = 1</script>",
  "",
  "![pixel](https://tracker.example/pixel.png)",
  "",
  "[safe link](https://example.test/docs) [bad link](javascript:alert(1))",
].join("\n");

export async function createProject(page: Page, { visibility = "public" as "public" | "private" } = {}) {
  const slug = `app-${randomBytes(4).toString("hex")}`;
  await page.goto("/projects/new");
  await page.getByLabel("Name", { exact: true }).fill("Tidewater Sync");
  await page.getByLabel("Short name").fill(slug);
  await page.getByLabel("Summary").fill("Sync feeds between your devices.");
  await page.getByLabel("Description").fill(DESCRIPTION);
  await page.getByLabel("Repository").fill("https://example.test/tidewater");
  await page.getByLabel("Status").selectOption("beta");
  await page.getByLabel("Licence").selectOption("AGPL-3.0-only");
  await page.getByRole("group", { name: "Operating systems and devices" }).getByLabel("Linux").check();
  await page.getByLabel(visibility === "public" ? "Public" : "Private", { exact: true }).check();
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(new RegExp(`/p/${slug}$`));
  return slug;
}
