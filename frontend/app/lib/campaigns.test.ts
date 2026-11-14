import { describe, expect, it } from "vitest";

import {
  campaignPayload,
  campaignProblem,
  campaignStatusStyleKey,
  answersPayload,
  canApply,
  canJoinDirectly,
  questionPayload,
  groupedChecksum,
  linkPayload,
  formatInZone,
  groupedTimeZones,
  isTestMethod,
  progressPayload,
  progressSummary,
  taskPayload,
  taskStatusStyleKey,
  timeZones,
  utcToZonedInput,
  zonedToUtc,
} from "./campaigns";

describe("zonedToUtc", () => {
  it("converts local times in a zone to UTC, including daylight saving time", () => {
    expect(zonedToUtc("2026-11-20T09:00", "Europe/Zurich")).toBe("2026-11-20T08:00:00.000Z"); // CET
    expect(zonedToUtc("2026-07-01T09:00", "Europe/Zurich")).toBe("2026-07-01T07:00:00.000Z"); // CEST
    expect(zonedToUtc("2026-11-20T09:00", "America/New_York")).toBe("2026-11-20T14:00:00.000Z");
    expect(zonedToUtc("2026-11-20T09:00", "UTC")).toBe("2026-11-20T09:00:00.000Z");
    expect(zonedToUtc("2026-11-20T09:00", "Asia/Kathmandu")).toBe("2026-11-20T03:15:00.000Z"); // +05:45
  });

  it("rejects malformed input and unknown zones", () => {
    for (const [local, zone] of [
      ["", "Europe/Zurich"],
      ["2026-11-20", "Europe/Zurich"],
      ["2026-13-01T09:00", "Europe/Zurich"],
      ["2026-11-20T25:00", "Europe/Zurich"],
      ["2026-11-20T09:00", "Mars/Olympus"],
      ["2026-11-20T09:00", ""],
    ] as [string, string][]) {
      expect(zonedToUtc(local, zone)).toBeNull();
    }
  });

  it("round-trips with utcToZonedInput", () => {
    for (const zone of ["Europe/Zurich", "America/Los_Angeles", "Australia/Sydney", "UTC"]) {
      const iso = zonedToUtc("2026-03-29T12:30", zone)!;
      expect(utcToZonedInput(iso, zone)).toBe("2026-03-29T12:30");
    }
    expect(utcToZonedInput("not a date", "UTC")).toBe("");
  });
});

describe("time zones", () => {
  it("lists IANA zones plus UTC, grouped by region", () => {
    const zones = timeZones();
    expect(zones).toContain("Europe/Zurich");
    expect(zones).toContain("UTC");
    const groups = groupedTimeZones(["Europe/Zurich", "Europe/Berlin", "UTC", "America/New_York"]);
    expect(groups).toEqual([
      { label: "Europe", options: ["Europe/Zurich", "Europe/Berlin"] },
      { label: "Other", options: ["UTC"] },
      { label: "America", options: ["America/New_York"] },
    ]);
  });

  it("formats in the campaign's zone", () => {
    expect(formatInZone("2026-11-20T08:00:00Z", "Europe/Zurich")).toBe("20 Nov 2026, 09:00");
  });
});

describe("campaignPayload", () => {
  const form = (entries: [string, string][]) => {
    const data = new FormData();
    for (const [k, v] of entries) data.append(k, v);
    return data;
  };
  const base: [string, string][] = [
    ["slug", " Beta-1 "],
    ["title", "Beta 1"],
    ["starts_at", "2026-11-20T09:00"],
    ["ends_at", "2026-12-04T18:00"],
    ["timezone", "Europe/Zurich"],
    ["target_testers", "20"],
    ["platforms", "linux"],
    ["platforms", "windows"],
  ];

  it("converts times and keeps participation only for public campaigns", () => {
    const privateForm = campaignPayload(form([...base, ["visibility", "private"], ["participation", "approval"]]));
    expect(privateForm.errors).toEqual({});
    expect(privateForm.values).toMatchObject({
      slug: "beta-1",
      starts_at: "2026-11-20T08:00:00.000Z",
      ends_at: "2026-12-04T17:00:00.000Z",
      target_testers: 20,
      platforms: ["linux", "windows"],
      visibility: "private",
    });
    expect(privateForm.values).not.toHaveProperty("participation");
    const publicForm = campaignPayload(form([...base, ["visibility", "public"], ["participation", "approval"]]));
    expect(publicForm.values).toMatchObject({ visibility: "public", participation: "approval" });
  });

  it("leaves out visibility when the form does not offer it (after publishing)", () => {
    const { values } = campaignPayload(form(base));
    expect(values).not.toHaveProperty("visibility");
    expect(values).not.toHaveProperty("participation");
  });

  it("sends the testing method only when the form offers it, and only known methods", () => {
    expect(campaignPayload(form([...base, ["method", "structured"]])).values).toMatchObject({ method: "structured" });
    expect(campaignPayload(form([...base, ["method", "<script>"]])).values).toMatchObject({ method: "free" });
    expect(campaignPayload(form(base)).values).not.toHaveProperty("method"); // frozen after publishing
  });

  it("reports unreadable dates as field errors", () => {
    const { errors } = campaignPayload(form([["starts_at", "soon"], ["timezone", "Europe/Zurich"]]));
    expect(errors).toEqual({ starts_at: "invalid", ends_at: "invalid" });
  });
});

describe("campaign helpers", () => {
  it("maps statuses to the design system and problems to known codes", () => {
    expect(campaignStatusStyleKey("in_progress")).toBe("In Progress");
    expect(campaignStatusStyleKey("in_review")).toBe("In Review");
    expect(campaignProblem(403, { code: "public_campaigns_locked" })).toBe("public_campaigns_locked");
    expect(campaignProblem(429, null)).toBe("rateLimited");
    expect(campaignProblem(403, { code: "<script>" })).toBe("forbidden");
    expect(campaignProblem(400, "nonsense")).toBe("generic");
  });
});

describe("links", () => {
  it("builds the payload and groups checksums", () => {
    const form = new FormData();
    form.set("label", "AppImage");
    form.set("url", "  https://downloads.example.org/app  ");
    form.set("platform", "");
    form.set("sha256", " ABC ");
    expect(linkPayload(form)).toEqual({ label: "AppImage", url: "https://downloads.example.org/app", platform: null, sha256: "ABC" });
    expect(groupedChecksum("a".repeat(16) + "b".repeat(4))).toBe("aaaaaaaa aaaaaaaa bbbb");
    expect(groupedChecksum("")).toBe("");
  });
});

describe("canJoinDirectly", () => {
  const base = {
    visibility: "public",
    participation: "direct",
    state: "published",
    can_edit: false,
    is_participant: false,
    participant_count: 1,
    target_testers: 2,
  } as Parameters<typeof canJoinDirectly>[0];

  it("offers joining only for open public campaigns with direct participation", () => {
    expect(canJoinDirectly(base)).toBe(true);
    expect(canJoinDirectly({ ...base, participant_count: 2 })).toBe(false); // full
    expect(canJoinDirectly({ ...base, participation: "approval" })).toBe(false);
    expect(canJoinDirectly({ ...base, visibility: "private", participation: "invitation" })).toBe(false);
    expect(canJoinDirectly({ ...base, state: "completed" })).toBe(false);
    expect(canJoinDirectly({ ...base, can_edit: true })).toBe(false); // the team
    expect(canJoinDirectly({ ...base, is_participant: true })).toBe(false);
  });
});

describe("questionPayload", () => {
  const form = (entries: Record<string, string>) => {
    const data = new FormData();
    for (const [k, v] of Object.entries(entries)) data.set(k, v);
    return data;
  };
  it("splits options by line for single choice only", () => {
    expect(questionPayload(form({ prompt: " Browser? ", kind: "single_choice", options: "Firefox\r\n\n Chrome \n", required: "on" }))).toEqual({
      prompt: "Browser?",
      kind: "single_choice",
      options: ["Firefox", "Chrome"],
      required: true,
    });
    expect(questionPayload(form({ prompt: "Notes", kind: "long_text", options: "stray" })).options).toEqual([]);
    expect(questionPayload(form({ prompt: "x", kind: "essay" })).kind).toBe("short_text");
  });
});

describe("applications", () => {
  const base = {
    visibility: "public",
    participation: "approval",
    state: "published",
    can_edit: false,
    is_participant: false,
    my_application: null,
    participant_count: 0,
    target_testers: 2,
  } as unknown as Parameters<typeof canApply>[0];

  it("offers the form only when applying is possible", () => {
    expect(canApply(base)).toBe(true);
    expect(canApply({ ...base, my_application: "withdrawn" })).toBe(true);
    expect(canApply({ ...base, my_application: "pending" })).toBe(false);
    expect(canApply({ ...base, my_application: "rejected" })).toBe(false);
    expect(canApply({ ...base, participant_count: 2 })).toBe(false);
    expect(canApply({ ...base, participation: "direct" })).toBe(false);
    expect(canApply({ ...base, can_edit: true })).toBe(false);
  });

  it("collects answers from the form", () => {
    const form = new FormData();
    form.set("csrf_token", "x");
    form.set("answer:q1", "  Laptop  ");
    form.set("answer:q2", "yes");
    expect(answersPayload(form)).toEqual({ q1: "Laptop", q2: "yes" });
  });
});

describe("test tasks", () => {
  it("recognises the three testing methods only", () => {
    expect(["free", "structured", "combined"].every(isTestMethod)).toBe(true);
    expect(isTestMethod("Structured")).toBe(false);
    expect(isTestMethod(undefined)).toBe(false);
  });

  it("builds the task payload from the form, with empty optional fields", () => {
    const data = new FormData();
    data.append("title", "Import a file");
    data.append("instructions", "Use **File > Import**.");
    expect(taskPayload(data)).toEqual({ title: "Import a file", instructions: "Use **File > Import**.", expected_result: "" });
  });

  it("maps the task problems to known codes", () => {
    for (const code of ["tasks_required", "tasks_exist", "too_many_tasks", "last_task", "free_method_has_no_tasks", "task_hidden"]) {
      expect(campaignProblem(400, { code })).toBe(code);
    }
  });
});

describe("task progress", () => {
  const form = (entries: [string, string][]) => {
    const data = new FormData();
    for (const [k, v] of entries) data.append(k, v);
    return data;
  };

  it("accepts only the four statuses and keeps the note", () => {
    expect(progressPayload(form([["status", "blocked"], ["note", "Crashes on start"]]))).toEqual({ status: "blocked", note: "Crashes on start" });
    expect(progressPayload(form([["status", "completed"]]))).toEqual({ status: "completed", note: "" });
    expect(progressPayload(form([["status", "done"]]))).toBeNull();
    expect(progressPayload(form([]))).toBeNull();
  });

  it("maps statuses to the design system and counts the viewer's progress", () => {
    expect(taskStatusStyleKey("not_started")).toBe("Not Started");
    expect(taskStatusStyleKey("blocked")).toBe("Blocked");
    expect(progressSummary([{ my_status: "completed" }, { my_status: "blocked" }, { my_status: "not_started" }, { my_status: "completed" }])).toEqual({
      total: 4,
      completed: 2,
      blocked: 1,
    });
  });
});
