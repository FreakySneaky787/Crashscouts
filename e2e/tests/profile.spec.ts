/**
 * WP 1.2 – profiles: privacy by default, per-field visibility, avatar upload pipeline.
 * Test images are generated at runtime; no binary fixtures in the repository.
 */
import { randomBytes } from "node:crypto";
import { crc32, deflateSync } from "node:zlib";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { createSignedInAccount } from "./helpers";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** Clicks a submit button and waits for the form's POST to be answered (an older success notice
 * may still be on screen, so the notice alone does not prove that this submission finished). */
async function submit(page: Page, button: string) {
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/settings/profile")),
    page.getByRole("button", { name: button }).click(),
  ]);
}

/** Minimal valid PNG (solid colour, RGB, 8 bit) built from scratch. */
function png(width: number, height: number): Buffer {
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

test("profile details stay private until switched on; only public fields reach the HTML", async ({ page, browser, request }) => {
  const account = await createSignedInAccount(page, request);
  const secretLink = `https://example.test/${randomBytes(6).toString("hex")}`;

  await page.getByRole("link", { name: "Edit profile" }).click();
  await expect(page).toHaveURL(/\/settings\/profile$/);
  await page.getByLabel("Bio").fill("I test sync tools on old laptops.");
  await page.getByLabel("Link").fill(secretLink);
  await page.getByRole("group", { name: "Operating systems and devices" }).getByLabel("Linux").check();
  await submit(page, "Save profile");
  await expect(page.getByRole("status")).toContainText("Your profile was saved.");

  // Nothing switched on yet: an anonymous visitor sees only the username.
  const anonymous = await browser.newContext();
  const visitor = await anonymous.newPage();
  await visitor.goto(`/u/${account.username}`);
  await expect(visitor.getByRole("heading", { name: account.username })).toBeVisible();
  await expect(visitor.getByText("I test sync tools")).toHaveCount(0);
  await expect(visitor.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");

  // Switch on the bio only.
  await page.getByLabel("Show on my public profile").first().check();
  await submit(page, "Save profile");
  await expect(page.getByRole("status")).toContainText("Your profile was saved.");

  const html = await (await request.get(`/u/${account.username}`)).text();
  expect(html).toContain("I test sync tools on old laptops.");
  expect(html).not.toContain(secretLink);
  expect(html).not.toContain("Linux");
  expect(html).not.toContain(account.email);
  await anonymous.close();
});

test("only https links are accepted", async ({ page, request }) => {
  await createSignedInAccount(page, request);
  await page.goto("/settings/profile");
  await page.getByLabel("Link").fill("http://example.test/insecure");
  await submit(page, "Save profile");
  await expect(page.getByText("Enter a complete link that starts with https://.")).toBeVisible();
});

test("avatar upload: re-encoded WebP, safe headers, disguised files rejected", async ({ page, request }) => {
  const account = await createSignedInAccount(page, request);
  await page.goto("/settings/profile");

  await page.getByLabel("Image file").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: png(320, 200) });
  await submit(page, "Upload avatar");
  await expect(page.getByRole("status")).toContainText("Your avatar was updated.");

  const response = await request.get(`/u/${account.username}`);
  const src = (await response.text()).match(/src="(\/avatars\/[0-9a-f-]{36})"/)?.[1];
  expect(src).toBeTruthy();
  const image = await request.get(src!);
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toBe("image/webp");
  expect(image.headers()["x-content-type-options"]).toBe("nosniff");
  expect(image.headers()["content-security-policy"]).toContain("sandbox");
  expect((await image.body()).subarray(8, 12).toString("ascii")).toBe("WEBP");

  // A script disguised as a PNG is refused.
  await page.getByLabel("Image file").setInputFiles({
    name: "evil.png",
    mimeType: "image/png",
    buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"),
  });
  await submit(page, "Upload avatar");
  await expect(page.getByRole("alert")).toContainText("Some entries need your attention.");
  await expect(page.getByText("Upload a PNG, JPEG or WebP image of at most 2 MB.").last()).toBeVisible();

  // Removing it makes the old image unreachable.
  await submit(page, "Remove avatar");
  await expect(page.getByRole("status")).toContainText("Your avatar was removed.");
  expect((await request.get(src!)).status()).toBe(404);
});

test("settings need a login; unknown and malformed profiles are 404", async ({ request, page }) => {
  await page.goto("/settings/profile");
  await expect(page).toHaveURL(/\/login\?next=%2Fsettings%2Fprofile$|\/login\?next=\/settings\/profile$/);

  for (const path of ["/u/nobody-here-123", "/u/..%2Fadmin", "/u/A", "/avatars/not-a-uuid", "/avatars/00000000-0000-4000-8000-000000000000"]) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
});

test("profile pages have no WCAG A/AA violations in light and dark", async ({ page, request, context }) => {
  const account = await createSignedInAccount(page, request);
  for (const theme of ["light", "dark"]) {
    await context.addCookies([{ name: "theme", value: theme, url: "http://127.0.0.1:3000" }]);
    for (const path of ["/settings/profile", `/u/${account.username}`, "/account"]) {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
      expect(results.violations.map((v) => `${theme} ${path}: ${v.id}`)).toEqual([]);
    }
  }
});
