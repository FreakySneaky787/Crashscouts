import { describe, expect, it } from "vitest";

import { hueIndex, IDENTITY_HUES, initials } from "./identity";
import { CAMPAIGN_STATUS, FEEDBACK_STATUS, PROJECT_STATUS, TASK_STATUS } from "./statuses";

describe("identity", () => {
  it("is deterministic and within range", () => {
    expect(hueIndex("tidewater")).toBe(hueIndex("tidewater"));
    for (const key of ["a", "aiko", "pgsnap", "", "Ünïcödé"]) {
      const h = hueIndex(key);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(IDENTITY_HUES);
    }
  });

  it("derives initials", () => {
    expect(initials("Aiko Tanaka")).toBe("AT");
    expect(initials("Mara  Lindqvist")).toBe("ML");
    expect(initials("pgsnap")).toBe("PG");
    expect(initials("  ")).toBe("?");
  });
});

describe("status maps cover every value from the PRD", () => {
  it("campaigns", () => {
    // The six statuses of the PRD plus "In Review" (team only), added by the security gate (ADR 0021).
    expect(Object.keys(CAMPAIGN_STATUS)).toEqual(["Draft", "In Review", "Open", "Full", "In Progress", "Completed", "Cancelled"]);
  });
  it("feedback", () => {
    expect(Object.keys(FEEDBACK_STATUS)).toEqual([
      "New", "Reviewed", "Confirmed", "In Progress", "Fixed", "Verified", "Duplicate", "Cannot Reproduce", "Rejected",
    ]);
  });
  it("tasks and projects", () => {
    expect(Object.keys(TASK_STATUS)).toEqual(["Not Started", "In Progress", "Completed", "Blocked"]);
    expect(Object.keys(PROJECT_STATUS)).toEqual(["Development", "Alpha", "Beta", "Stable", "Archived"]);
  });
});
