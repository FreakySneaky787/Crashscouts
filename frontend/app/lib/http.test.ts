import { describe, expect, it } from "vitest";

import {
  CSRF_COOKIES,
  SESSION_COOKIES,
  cacheHeadersFor,
  hasSessionCookie,
  readAnyCookie,
  readAnySetCookie,
  sourceCodeUrl,
  isUuid,
  privateNoStoreHeaders,
  publicCacheHeaders,
  readCookie,
  readSetCookie,
  safeRedirectPath,
  setCookieHeaders,
} from "./http";

describe("readCookie", () => {
  it("finds a cookie among several", () => {
    expect(readCookie("a=1; csrftoken=abc; sessionid=xyz", "csrftoken")).toBe("abc");
  });
  it("does not confuse names sharing a suffix", () => {
    expect(readCookie("xsessionid=evil; other=1", "sessionid")).toBeNull();
  });
  it("returns null for a missing header or empty value", () => {
    expect(readCookie(null, "sessionid")).toBeNull();
    expect(readCookie("sessionid=", "sessionid")).toBeNull();
  });
});

describe("readSetCookie", () => {
  it("reads the value from Set-Cookie headers", () => {
    const headers = [
      "sessionid=s1; HttpOnly; Path=/",
      "csrftoken=t1; expires=Thu, 01 Jan 2099 00:00:00 GMT; Path=/; SameSite=Lax",
    ];
    expect(readSetCookie(headers, "csrftoken")).toBe("t1");
    expect(readSetCookie(headers, "missing")).toBeNull();
  });
});

describe("cache headers", () => {
  it("private responses are not storable and vary by cookie", () => {
    const headers = privateNoStoreHeaders();
    expect(headers.get("Cache-Control")).toBe("private, no-store");
    expect(headers.get("Vary")).toBe("Cookie");
  });

  it("public responses are cacheable and vary by cookie", () => {
    const headers = publicCacheHeaders(30);
    expect(headers.get("Cache-Control")).toBe("public, max-age=30");
    expect(headers.get("Vary")).toBe("Cookie");
  });

  it("never public-cached when a session cookie is present", () => {
    const anonymous = new Request("http://x.test/", { headers: {} });
    const loggedIn = new Request("http://x.test/", { headers: { Cookie: "sessionid=abc" } });
    expect(cacheHeadersFor(anonymous).get("Cache-Control")).toBe("public, max-age=60");
    expect(cacheHeadersFor(loggedIn).get("Cache-Control")).toBe("private, no-store");
  });
});

describe("setCookieHeaders", () => {
  it("keeps multiple Set-Cookie headers separate", () => {
    const headers = setCookieHeaders(["a=1; Path=/", "b=2; Path=/"]);
    expect(headers.getSetCookie()).toEqual(["a=1; Path=/", "b=2; Path=/"]);
  });
});

describe("isUuid", () => {
  it("accepts UUIDs", () => {
    expect(isUuid("3f2c1a7e-9b8d-4c6e-a1f2-0123456789ab")).toBe(true);
  });
  it.each(["../admin", "123", "3f2c1a7e-9b8d-4c6e-a1f2-0123456789ab/../x", "", null])(
    "rejects %s",
    (value) => {
      expect(isUuid(value)).toBe(false);
    },
  );
});

describe("safeRedirectPath (open redirect protection)", () => {
  it.each(["/account", "/probe/private/123?x=1", "/a#b"])("allows local path %s", (path) => {
    expect(safeRedirectPath(path)).toBe(path);
  });

  it.each([
    "//evil.example",
    "/\\evil.example",
    "https://evil.example",
    "javascript:alert(1)",
    "evil",
    "",
    "/\u0000x",
    "/\nx",
    null,
    undefined,
    42,
  ])("rejects %s", (target) => {
    expect(safeRedirectPath(target, "/fallback")).toBe("/fallback");
  });
});

describe("prefixed cookie names (ASVS 5.0 V3.3.1)", () => {
  it("reads the production names and the development names", () => {
    expect(readAnyCookie("__Host-csrftoken=abc; theme=dark", CSRF_COOKIES)).toBe("abc");
    expect(readAnyCookie("csrftoken=dev", CSRF_COOKIES)).toBe("dev");
    expect(readAnyCookie("theme=dark", CSRF_COOKIES)).toBeNull();
    expect(readAnySetCookie(["__Host-csrftoken=xyz; Path=/; Secure"], CSRF_COOKIES)).toBe("xyz");
    const request = (cookie: string) => new Request("http://localhost/", { headers: { Cookie: cookie } });
    expect(hasSessionCookie(request("__Host-sessionid=s"))).toBe(true);
    expect(hasSessionCookie(request("sessionid=s"))).toBe(true);
    expect(hasSessionCookie(request("theme=dark"))).toBe(false);
    expect(SESSION_COOKIES[0]).toBe("__Host-sessionid");
  });
});

describe("AGPL source code link (WP 8.5)", () => {
  it("accepts https addresses only", () => {
    expect(sourceCodeUrl("https://github.com/example/project")).toBe("https://github.com/example/project");
    expect(sourceCodeUrl(undefined)).toBeNull();
    expect(sourceCodeUrl("")).toBeNull();
    expect(sourceCodeUrl("http://example.test")).toBeNull();
    expect(sourceCodeUrl("javascript:alert(1)")).toBeNull();
    expect(sourceCodeUrl("not a url")).toBeNull();
  });
});
