import { describe, expect, it } from "vitest";

import { createI18n } from "./index";

describe("createI18n", () => {
  it("provides usable translations immediately (synchronous init)", () => {
    const i18n = createI18n();
    expect(i18n.t("login.title")).toBe("Log in");
    expect(i18n.t("account.signedInAs", { username: "ada" })).toBe("Signed in as ada");
  });

  it("creates a separate instance per call (no state shared between requests)", () => {
    const first = createI18n();
    const second = createI18n();
    expect(first).not.toBe(second);
    void first.changeLanguage("de");
    expect(second.language).toBe("en");
  });

  it("does not double-escape interpolation (React handles escaping)", () => {
    const i18n = createI18n();
    expect(i18n.t("account.signedInAs", { username: "<b>" })).toBe("Signed in as <b>");
  });
});
