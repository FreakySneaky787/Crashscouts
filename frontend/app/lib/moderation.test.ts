import { describe, expect, it } from "vitest";

import { caseTargetHref, isCaseType, suspensionEnd } from "./moderation";

const ID = "6b1a3c1e-6a3c-4c1e-9a3c-1e6a3c1e6a3c";

describe("moderation cases", () => {
  it("knows people and feedback as case types (WP 7.1)", () => {
    expect(isCaseType("user")).toBe(true);
    expect(isCaseType("feedback")).toBe(true);
    expect(isCaseType("account")).toBe(false);
  });

  it("links to the reported person or visible feedback only", () => {
    expect(caseTargetHref({ target_type: "user", project: null, username: "tess", blocked: false })).toBe("/u/tess");
    const feedback = { target_type: "feedback" as const, project: "tidewater", campaign: "beta-1", feedback: ID, blocked: false };
    expect(caseTargetHref(feedback)).toBe(`/p/tidewater/c/beta-1/feedback/${ID}`);
    expect(caseTargetHref({ ...feedback, blocked: true })).toBeNull(); // hidden: moderators cannot open it
    expect(caseTargetHref({ target_type: "project", project: "tidewater", blocked: false })).toBeNull();
  });
});

describe("suspension end (WP 7.2)", () => {
  it("is the end of the chosen day in UTC, or null for permanently", () => {
    expect(suspensionEnd(false, "2027-01-31")).toBe("2027-01-31T23:59:59Z");
    expect(suspensionEnd(true, "")).toBeNull();
    expect(suspensionEnd(true, "2027-01-31")).toBeNull();
  });

  it("refuses anything that is not a date", () => {
    for (const day of ["", "31.01.2027", "2027-1-31", "2027-13-45", "2027-01-31T00:00"]) expect(suspensionEnd(false, day)).toBe("invalid");
  });
});
