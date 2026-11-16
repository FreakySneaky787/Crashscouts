/**
 * WP 8.6 part C – the core flows with the keyboard only (WCAG 2.1.1 Keyboard, 2.1.2 No Keyboard
 * Trap, 2.4.7 Focus Visible, 2.4.11 Focus Not Obscured): sign up and sign in, create and publish a
 * campaign, join it, give feedback and report a project. No mouse clicks and no `fill()`: only
 * Tab, Enter, Space, typing and the arrow keys inside native controls. Every focus stop is checked
 * for a visible focus indicator inside the viewport.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

import { createProject, createSignedInAccount, linkFromMail, newAccount } from "./helpers";

/** Tabs forward until `target` has the focus; fails on a keyboard trap or an invisible focus. */
async function tabTo(page: Page, target: Locator, maxPresses = 120) {
  // Start only once the page has settled: right after a redirect React Router may still render the
  // new page and restore the scroll position, which can move an already focused element out of
  // view (a flaky CI failure, reproduced locally in 1 of 24 parallel runs). A person does not press
  // Tab within those milliseconds.
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  let previous = "";
  let samePlace = 0;
  for (let press = 0; press < maxPresses; press++) {
    await page.keyboard.press("Tab");
    const focus = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return { id: "body", visible: true, inView: true };
      const drawn = (node: Element | null) => {
        if (!node) return false;
        const style = getComputedStyle(node);
        return (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2) || style.boxShadow !== "none";
      };
      const rect = el.getBoundingClientRect();
      return {
        // Checkboxes of one group share their name: value and label tell them apart.
        id: [
          `${el.tagName}#${el.id}[${el.getAttribute("name") ?? ""}=${el.getAttribute("value") ?? ""}]`,
          ((el as HTMLInputElement).labels?.[0]?.textContent ?? el.textContent ?? "").trim().slice(0, 30),
        ].join(" "),
        visible: drawn(el) || drawn(el.parentElement) || drawn(el.closest("label")),
        inView: rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth,
      };
    });
    if (focus.id !== "body") {
      expect(focus.visible, `focus indicator on ${focus.id}`).toBe(true);
      expect(focus.inView, `focused element in view: ${focus.id}`).toBe(true);
    }
    // Date inputs keep the focus for their segments; more than that is a trap.
    samePlace = focus.id === previous ? samePlace + 1 : 0;
    expect(samePlace, `keyboard trap at ${focus.id}`).toBeLessThan(8);
    previous = focus.id;
    if (await target.evaluate((el) => el === document.activeElement)) return;
  }
  throw new Error(`not reachable with Tab: ${target.toString()}`);
}

/** Replaces the field's content by typing (Ctrl+A first, so prefilled values go). */
async function typeInto(page: Page, target: Locator, text: string) {
  await tabTo(page, target);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type(text);
}

/** Date and time fields: month, day and year; the year takes up to six digits, so the right
 * arrow moves on to hour and minute, then A or P. */
async function typeDate(page: Page, target: Locator, date: string, time: string) {
  await tabTo(page, target);
  await page.keyboard.type(date);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.type(time);
}

async function press(page: Page, target: Locator, key: "Enter" | "Space" = "Enter") {
  await tabTo(page, target);
  await page.keyboard.press(key);
}

test("sign up, confirm and sign in with the keyboard only", async ({ page, request }) => {
  const account = newAccount();
  await page.goto("/signup");
  await typeInto(page, page.getByLabel("Email address"), account.email);
  await typeInto(page, page.getByLabel("Username"), account.username);
  await typeInto(page, page.getByLabel("Password", { exact: true }), account.password);
  await press(page, page.getByLabel("I am at least 16 years old."), "Space");
  await expect(page.getByLabel("I am at least 16 years old.")).toBeChecked();
  await press(page, page.getByRole("button", { name: "Create account" }));
  await expect(page).toHaveURL(/\/signup\/check-email$/);

  await page.goto(await linkFromMail(request, account.email, "verify-email"));
  await press(page, page.getByRole("button", { name: "Confirm email address" }));
  await expect(page).toHaveURL(/\/login\?verified=1$/);
  await typeInto(page, page.getByLabel("Email address"), account.email);
  await typeInto(page, page.getByLabel("Password", { exact: true }), account.password);
  await press(page, page.getByRole("button", { name: "Log in" }));
  await expect(page).toHaveURL(/\/account$/);
});

test("create a campaign, join it, give feedback and report with the keyboard only", async ({ page, request, browser }) => {
  test.setTimeout(180_000);
  // The project itself is set up as usual; the campaign is created with the keyboard.
  await createSignedInAccount(page, request);
  const project = await createProject(page);
  await page.goto(`/p/${project}/c/new`);
  await typeInto(page, page.getByLabel("Title"), "Keyboard beta");
  await typeInto(page, page.getByLabel("Short name"), "kb-beta");
  await typeInto(page, page.getByLabel("Summary"), "Tested without a mouse.");
  await typeInto(page, page.getByLabel("Software version"), "1.0.0");
  await typeDate(page, page.getByLabel("Start"), "03012027", "0900A");
  await typeDate(page, page.getByLabel("End"), "03152027", "0600P");
  await expect(page.getByLabel("Start")).toHaveValue("2027-03-01T09:00");
  await expect(page.getByLabel("End")).toHaveValue("2027-03-15T18:00");
  await typeInto(page, page.getByLabel("Testers wanted"), "5");
  // A radio group: Tab reaches the chosen option, the arrow keys change it.
  await tabTo(page, page.getByLabel("Free testing", { exact: true }));
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByLabel("Combined testing", { exact: true })).toBeChecked();
  await press(page, page.getByRole("button", { name: "Create draft" }));
  await expect(page).toHaveURL(/\/c\/kb-beta$/);

  await page.goto(`/p/${project}/c/kb-beta/edit`);
  const tasks = page.getByRole("region", { name: "Test tasks" });
  await typeInto(page, tasks.getByRole("textbox", { name: "Task", exact: true }), "Use only the keyboard");
  await press(page, tasks.getByRole("button", { name: "Add task" }));
  await expect(page.getByText("The task was added.")).toBeVisible();
  await press(page, page.getByRole("button", { name: "Publish" }));
  await expect(page).toHaveURL(/\/c\/kb-beta$/);

  // A tester is invited and joins with the keyboard.
  const testerContext = await browser.newContext();
  const tester = await testerContext.newPage();
  const account = await createSignedInAccount(tester, request);
  await page.goto(`/p/${project}/c/kb-beta/testers`);
  await typeInto(page, page.getByLabel("Username"), account.username);
  await press(page, page.getByRole("button", { name: "Invite" }));
  await expect(page.getByText("The invitation was sent.")).toBeVisible();
  await tester.goto("/account");
  await press(tester, tester.getByRole("button", { name: "Accept the invitation to Keyboard beta" }));
  await expect(tester.getByText("You take part in the campaign now.")).toBeVisible();

  // Feedback.
  await tester.goto(`/p/${project}/c/kb-beta`);
  await press(tester, tester.getByRole("link", { name: "Give feedback" }));
  await expect(tester).toHaveURL(/\/feedback\/new/);
  await press(tester, tester.getByRole("link", { name: "Bug report" }));
  await typeInto(tester, tester.getByLabel("Title"), "Tab order skips the menu");
  await typeInto(tester, tester.getByLabel("Description"), "Found while testing with the keyboard.");
  await typeInto(tester, tester.getByLabel("Steps to reproduce"), "1. Press Tab");
  await typeInto(tester, tester.getByLabel("Expected behaviour"), "The menu gets the focus.");
  await typeInto(tester, tester.getByLabel("Actual behaviour"), "It is skipped.");
  await press(tester, tester.getByRole("button", { name: "Send feedback" }));
  await expect(tester.getByText("Thank you. Your feedback was sent.")).toBeVisible();

  // Report the project.
  await tester.goto(`/p/${project}`);
  await press(tester, tester.getByRole("link", { name: "Report" }));
  await expect(tester).toHaveURL(/\/report\?/);
  await tabTo(tester, tester.getByLabel("Reason"));
  await tester.keyboard.type("Spam"); // a native select picks the option by typing its name
  await expect(tester.getByLabel("Reason")).toHaveValue("spam");
  await typeInto(tester, tester.getByLabel("Details (optional)"), "Only advertising.");
  await press(tester, tester.getByRole("button", { name: "Send report" }));
  await expect(tester.getByText("Thank you. Moderators will review your report.")).toBeVisible();
  await testerContext.close();
});
