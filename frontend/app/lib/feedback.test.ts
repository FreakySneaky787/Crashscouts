import { describe, expect, it } from "vitest";

import { feedbackPayload, feedbackProblem, feedbackStatusStyleKey, formatSize, isFeedbackKind, isFeedbackStatus } from "./feedback";

const form = (entries: [string, string][]) => {
  const data = new FormData();
  for (const [k, v] of entries) data.append(k, v);
  return data;
};

describe("feedbackPayload", () => {
  it("sends the common fields and only the fields of the chosen kind", () => {
    const data = form([
      ["title", "Crash on import"],
      ["description", "The app closes."],
      ["steps", " 1. Open\n2. Import "],
      ["expected", "Imported"],
      ["actual", "Crash"],
      ["platform", "linux"],
      ["location", "should be ignored"],
      ["task", ""],
    ]);
    expect(feedbackPayload(data, "bug")).toEqual({
      kind: "bug",
      title: "Crash on import",
      description: "The app closes.",
      steps: "1. Open\n2. Import",
      expected: "Imported",
      actual: "Crash",
      platform: "linux",
      task: null,
    });
  });

  it("sends no platform as null and keeps a chosen task", () => {
    expect(feedbackPayload(form([["title", "x"], ["description", "y"], ["task", "t-1"]]), "general")).toEqual({
      kind: "general",
      title: "x",
      description: "y",
      task: "t-1",
    });
    expect(feedbackPayload(form([["result", "partly"]]), "compatibility")).toMatchObject({ platform: null, result: "partly" });
  });
});

describe("feedback helpers", () => {
  it("recognises kinds and statuses", () => {
    expect(isFeedbackKind("compatibility")).toBe(true);
    expect(isFeedbackKind("Bug")).toBe(false);
    expect(isFeedbackStatus("cannot_reproduce")).toBe(true);
    expect(isFeedbackStatus("done")).toBe(false);
  });

  it("maps statuses to the design system and problems to known codes", () => {
    expect(feedbackStatusStyleKey("cannot_reproduce")).toBe("Cannot Reproduce");
    expect(feedbackProblem(400, { code: "feedback_locked" })).toBe("feedback_locked");
    expect(feedbackProblem(429, null)).toBe("rateLimited");
    expect(feedbackProblem(413, null)).toBe("invalid_file");
    expect(feedbackProblem(400, { code: "<script>" })).toBe("generic");
  });

  it("formats sizes for people", () => {
    expect(formatSize(300)).toBe("1 KB");
    expect(formatSize(340 * 1024)).toBe("340 KB");
    expect(formatSize(1.25 * 1024 * 1024)).toBe("1.3 MB");
  });
});
