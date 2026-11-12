import { describe, expect, it } from "vitest";

import { avatarSrc, isValidUsername, linkLabel, profilePayload } from "./profile";

describe("isValidUsername", () => {
  it("accepts the backend's username format", () => {
    expect(isValidUsername("alice")).toBe(true);
    expect(isValidUsername("e2e-c633_9")).toBe(true);
  });

  it("rejects anything else before it reaches a backend path", () => {
    for (const value of [undefined, "", "ab", "Alice", "-alice", "a".repeat(31), "../admin", "alice%2F..", "al ice"]) {
      expect(isValidUsername(value)).toBe(false);
    }
  });
});

describe("avatarSrc", () => {
  it("builds the resource route path or returns null", () => {
    expect(avatarSrc("3f0f1c1e-4d1b-4c55-9a55-0e7c2a3d9b10")).toBe("/avatars/3f0f1c1e-4d1b-4c55-9a55-0e7c2a3d9b10");
    expect(avatarSrc(null)).toBeNull();
  });
});

describe("profilePayload", () => {
  it("maps checkboxes and multi-selects", () => {
    const form = new FormData();
    form.set("bio", "Hello");
    form.set("link", "  https://example.test/me ");
    form.append("platforms", "linux");
    form.append("platforms", "android");
    form.set("show_bio", "on");
    expect(profilePayload(form)).toEqual({
      bio: "Hello",
      link: "https://example.test/me",
      indexable: false,
      interests: [],
      platforms: ["linux", "android"],
      skills: [],
      show_bio: true,
      show_link: false,
      show_interests: false,
      show_platforms: false,
      show_skills: false,
    });
  });
});

describe("linkLabel", () => {
  it("shows host and path without the scheme", () => {
    expect(linkLabel("https://example.test/")).toBe("example.test");
    expect(linkLabel("https://example.test/alice")).toBe("example.test/alice");
    expect(linkLabel("not a url")).toBe("not a url");
  });
});
