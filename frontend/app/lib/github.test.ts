import { describe, expect, it } from "vitest";

import { isGitHubAuthorizeUrl, providerErrorKey, suggestUsername } from "./github";

describe("isGitHubAuthorizeUrl", () => {
  it("accepts only GitHub's authorization page over https", () => {
    expect(isGitHubAuthorizeUrl("https://github.com/login/oauth/authorize?client_id=x&state=y")).toBe(true);
    for (const url of [
      null,
      "",
      "http://github.com/login/oauth/authorize",
      "https://github.com.evil.example/login/oauth/authorize",
      "https://evil.example/login/oauth/authorize",
      "https://github.com/other",
      "/login/provider/callback",
      "javascript:alert(1)",
    ]) {
      expect(isGitHubAuthorizeUrl(url)).toBe(false);
    }
  });
});

describe("providerErrorKey", () => {
  it("maps allauth errors", () => {
    expect(providerErrorKey(null)).toBeNull();
    expect(providerErrorKey("cancelled")).toBe("cancelled");
    expect(providerErrorKey("permission_denied")).toBe("denied");
    expect(providerErrorKey("signup_closed")).toBe("closed");
    expect(providerErrorKey("unknown")).toBe("failed");
  });
});

describe("suggestUsername", () => {
  it("follows the username rules", () => {
    expect(suggestUsername("Octo-Tester")).toBe("octo-tester");
    expect(suggestUsername("dot.name")).toBe("dot-name");
    expect(suggestUsername("--x")).toBe("");
    expect(suggestUsername("a".repeat(40))).toHaveLength(30);
    expect(suggestUsername(undefined)).toBe("");
  });
});
