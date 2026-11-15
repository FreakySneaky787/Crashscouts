import { describe, expect, it } from "vitest";

import { escapeMarkdown, fillLegalText, isLegalSlug, legalTextsReviewed, missingOperatorSettings } from "./legal";

describe("legal texts (WP 8.5)", () => {
  it("fills operator settings as plain text", () => {
    const env = { OPERATOR_NAME: "Alex Example", OPERATOR_ADDRESS: "Street 1\n8000 Zurich", CONTACT_EMAIL: "privacy@example.test" };
    const text = fillLegalText("{{operator_name}}|{{operator_address}}|{{contact_email}}|{{platform}}|{{unknown}}", env, "Crashscouts");
    expect(text).toBe("Alex Example|Street 1  \n8000 Zurich|privacy@example\\.test|Crashscouts|{{unknown}}");
    // A one-line env value with a literal "\n" gives the same lines.
    expect(fillLegalText("{{operator_address}}", { OPERATOR_ADDRESS: "Street 1\\n8000 Zurich" }, "P")).toBe("Street 1  \n8000 Zurich");
  });

  it("never lets a configured value add Markdown or HTML", () => {
    const env = { OPERATOR_NAME: "[x](javascript:alert(1)) <img src=x> **bold**" };
    const text = fillLegalText("{{operator_name}}", env, "P");
    expect(text).not.toMatch(/(^|[^\\])[[\]()<>*]/);
    expect(escapeMarkdown("a_b")).toBe("a\\_b");
  });

  it("shows visible placeholders and reports missing settings", () => {
    expect(fillLegalText("{{contact_email}}", {}, "P")).toBe("\\[contact email – configured on the server\\]");
    expect(missingOperatorSettings({ OPERATOR_NAME: "x", CONTACT_EMAIL: " " })).toEqual(["OPERATOR_ADDRESS", "CONTACT_EMAIL"]);
    expect(missingOperatorSettings({ OPERATOR_NAME: "x", OPERATOR_ADDRESS: "y", CONTACT_EMAIL: "z" })).toEqual([]);
  });

  it("knows its pages and the review flag", () => {
    expect(isLegalSlug("privacy")).toBe(true);
    expect(isLegalSlug("toString")).toBe(false);
    expect(legalTextsReviewed({})).toBe(false);
    expect(legalTextsReviewed({ LEGAL_TEXTS_REVIEWED: "true" })).toBe(true);
  });
});
