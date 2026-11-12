import { describe, expect, it } from "vitest";

import { createI18n } from "./index";

describe("createI18n", () => {
  it("liefert sofort nutzbare Übersetzungen (synchron initialisiert)", () => {
    const i18n = createI18n();
    expect(i18n.t("login.title")).toBe("Log in");
    expect(i18n.t("account.signedInAs", { username: "ada" })).toBe("Signed in as ada");
  });

  it("erzeugt pro Aufruf eine eigene Instanz (kein geteilter Zustand zwischen Anfragen)", () => {
    const first = createI18n();
    const second = createI18n();
    expect(first).not.toBe(second);
    void first.changeLanguage("de");
    expect(second.language).toBe("en");
  });

  it("escapt Interpolation nicht doppelt (React übernimmt das Escaping)", () => {
    const i18n = createI18n();
    expect(i18n.t("account.signedInAs", { username: "<b>" })).toBe("Signed in as <b>");
  });
});
