import { describe, expect, it } from "vitest";

import { isValidProjectSlug, projectErrorCodes, projectPayload, statusLabel } from "./projects";

describe("isValidProjectSlug", () => {
  it("follows the backend rule", () => {
    expect(isValidProjectSlug("tidewater")).toBe(true);
    expect(isValidProjectSlug("sync-engine-2")).toBe(true);
    for (const value of [undefined, "ab", "-x1", "x1-", "double--hyphen", "Upper", "a".repeat(41), "../admin", "has space"]) {
      expect(isValidProjectSlug(value)).toBe(false);
    }
  });
});

describe("projectPayload", () => {
  it("maps the form, lowercases the slug and defaults to private", () => {
    const form = new FormData();
    form.set("slug", " Tidewater ");
    form.set("name", "Tidewater");
    form.set("license", "MIT");
    form.append("platforms", "linux");
    form.append("platforms", "android");
    const payload = projectPayload(form);
    expect(payload.slug).toBe("tidewater");
    expect(payload.visibility).toBe("private");
    expect(payload.platforms).toEqual(["linux", "android"]);
    expect(payload.categories).toEqual([]);
  });
});

describe("projectErrorCodes", () => {
  it("takes the first code per field and ignores other shapes", () => {
    expect(projectErrorCodes({ slug: ["slug_taken", "x"], name: ["blank"] })).toEqual({ slug: "slug_taken", name: "blank" });
    expect(projectErrorCodes({ detail: "Not found." })).toEqual({});
    expect(projectErrorCodes(null)).toEqual({});
  });
});

describe("statusLabel", () => {
  it("maps API values to the status pills", () => {
    expect(statusLabel("beta")).toBe("Beta");
  });
});
