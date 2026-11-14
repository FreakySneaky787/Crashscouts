/**
 * Pure helper functions for HTTP headers, cookies and redirects.
 * Deliberately side-effect free so they can be tested in isolation (http.test.ts).
 */

/**
 * Django's cookie names: production uses the "__Host-" prefix (ASVS 5.0 V3.3.1: HTTPS only, this
 * host only), development over plain HTTP the defaults. The first name found wins.
 */
export const SESSION_COOKIES = ["__Host-sessionid", "sessionid"] as const;
export const CSRF_COOKIES = ["__Host-csrftoken", "csrftoken"] as const;

/** Reads the first of several cookie names from a `Cookie` request header. */
export function readAnyCookie(cookieHeader: string | null, names: readonly string[]): string | null {
  for (const name of names) {
    const value = readCookie(cookieHeader, name);
    if (value !== null) return value;
  }
  return null;
}

/** Reads the first of several cookie names from `Set-Cookie` headers. */
export function readAnySetCookie(setCookies: readonly string[], names: readonly string[]): string | null {
  for (const name of names) {
    const value = readSetCookie(setCookies, name);
    if (value !== null) return value;
  }
  return null;
}

/** Reads a cookie value from a `Cookie` request header. */
export function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    if (key === name) {
      const value = part.slice(index + 1).trim();
      return value === "" ? null : value;
    }
  }
  return null;
}

/** Reads a cookie value from a list of `Set-Cookie` headers. */
export function readSetCookie(setCookies: readonly string[], name: string): string | null {
  for (const header of setCookies) {
    const first = header.split(";", 1)[0] ?? "";
    const index = first.indexOf("=");
    if (index === -1) continue;
    if (first.slice(0, index).trim() === name) {
      const value = first.slice(index + 1).trim();
      return value === "" ? null : value;
    }
  }
  return null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validates URL params before they are used in backend paths (no path tricks such as "../"). */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/** Does the request carry a (possible) session? Then the response must never be shared-cached. */
export function hasSessionCookie(request: Request): boolean {
  return readAnyCookie(request.headers.get("Cookie"), SESSION_COOKIES) !== null;
}

/** Headers for responses with user-specific or private data (docs/SECURITY.md §8). */
export function privateNoStoreHeaders(): Headers {
  return new Headers({
    "Cache-Control": "private, no-store",
    Vary: "Cookie",
  });
}

/** Headers for anonymous public pages: briefly cacheable, but only without a session. */
export function publicCacheHeaders(maxAgeSeconds = 60): Headers {
  return new Headers({
    "Cache-Control": `public, max-age=${maxAgeSeconds}`,
    Vary: "Cookie",
  });
}

/** Picks cache headers for the request: always private when a session cookie is present. */
export function cacheHeadersFor(request: Request, maxAgeSeconds = 60): Headers {
  return hasSessionCookie(request) ? privateNoStoreHeaders() : publicCacheHeaders(maxAgeSeconds);
}

/** Copies all `Set-Cookie` headers of a backend response into new headers. */
export function setCookieHeaders(setCookies: readonly string[], base?: HeadersInit): Headers {
  const headers = new Headers(base);
  for (const cookie of setCookies) headers.append("Set-Cookie", cookie);
  return headers;
}

function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/**
 * Protects against open redirects: only local absolute paths (e.g. "/account").
 * Anything else ("//evil.example", "https://…", "javascript:…", "/\\evil") becomes the fallback.
 */
export function safeRedirectPath(target: unknown, fallback = "/"): string {
  if (typeof target !== "string" || target.length === 0 || target.length > 2048) return fallback;
  if (!target.startsWith("/")) return fallback;
  if (target.startsWith("//") || target.startsWith("/\\")) return fallback;
  if (hasControlCharacter(target)) return fallback;
  try {
    const resolved = new URL(target, "http://internal.invalid");
    if (resolved.origin !== "http://internal.invalid") return fallback;
    return resolved.pathname + resolved.search + resolved.hash;
  } catch {
    return fallback;
  }
}
