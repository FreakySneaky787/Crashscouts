/**
 * Reine Hilfsfunktionen für HTTP-Header, Cookies und Weiterleitungen.
 * Bewusst ohne Seiteneffekte, damit sie isoliert getestet werden können (http.test.ts).
 */

/** Cookie-Namen von Django (Standardwerte). */
export const SESSION_COOKIE = "sessionid";
export const CSRF_COOKIE = "csrftoken";

/** Liest einen Cookie-Wert aus einem `Cookie`-Request-Header. */
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

/** Liest den Wert eines Cookies aus einer Liste von `Set-Cookie`-Headern. */
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

/** Prüft URL-Parameter, bevor sie in Backend-Pfade eingesetzt werden (kein Pfad-Trick wie "../"). */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/** Hat die Anfrage eine (mögliche) Session? Dann darf die Antwort nie gemeinsam gecacht werden. */
export function hasSessionCookie(request: Request): boolean {
  return readCookie(request.headers.get("Cookie"), SESSION_COOKIE) !== null;
}

/** Header für Antworten mit nutzerbezogenen oder privaten Daten (docs/SECURITY.md §8). */
export function privateNoStoreHeaders(): Headers {
  return new Headers({
    "Cache-Control": "private, no-store",
    Vary: "Cookie",
  });
}

/** Header für anonyme, öffentliche Seiten: kurzzeitig cachebar, aber nur ohne Session. */
export function publicCacheHeaders(maxAgeSeconds = 60): Headers {
  return new Headers({
    "Cache-Control": `public, max-age=${maxAgeSeconds}`,
    Vary: "Cookie",
  });
}

/** Wählt die Cache-Header passend zur Anfrage: mit Session-Cookie immer privat. */
export function cacheHeadersFor(request: Request, maxAgeSeconds = 60): Headers {
  return hasSessionCookie(request) ? privateNoStoreHeaders() : publicCacheHeaders(maxAgeSeconds);
}

/** Überträgt alle `Set-Cookie`-Header einer Backend-Antwort in neue Header. */
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
 * Schützt vor offenen Weiterleitungen: nur lokale, absolute Pfade (z. B. "/account").
 * Alles andere ("//evil.example", "https://…", "javascript:…", "/\\evil") wird zum Fallback.
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
