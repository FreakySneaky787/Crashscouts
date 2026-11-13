/** Shared E2E helpers: unique test accounts, reading emails from Mailpit, signing in, TOTP. */
import { createHmac, randomBytes } from "node:crypto";
import { crc32, deflateSync } from "node:zlib";

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

/** Minimal valid PNG (solid colour, RGB, 8 bit) built from scratch. */
export function png(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x5a)]);
  const pixels = deflateSync(Buffer.concat(Array.from({ length: height }, () => row)));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", pixels),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** RFC 6238 TOTP (SHA-1, 6 digits, 30-second steps), independent of the application. */
export function totp(secret: string, at = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = secret
    .replace(/[\s=]/g, "")
    .toUpperCase()
    .split("")
    .map((c) => alphabet.indexOf(c).toString(2).padStart(5, "0"))
    .join("");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

export async function readSecret(page: Page): Promise<string> {
  return (await page.getByTestId("totp-secret").innerText()).replace(/\s+/g, "");
}

/** Turns on TOTP from the security page, including the password confirmation. */
export async function enableTotp(page: Page, password: string): Promise<string> {
  await page.goto("/settings/security");
  await page.getByLabel("Code", { exact: true }).fill(totp(await readSecret(page)));
  await page.getByRole("button", { name: "Turn on" }).click();

  // Security changes require a fresh password confirmation.
  await expect(page).toHaveURL(/\/reauthenticate\?next=/);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page).toHaveURL(/\/settings\/security$/);

  const secret = await readSecret(page);
  await page.getByLabel("Code", { exact: true }).fill(totp(secret));
  await page.getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByRole("status").first()).toContainText("Two-factor authentication is on.");
  return secret;
}
