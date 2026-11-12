/**
 * Colour theme preference (system / light / dark), stored in a first-party cookie so the server
 * can render the correct theme without a flash. The cookie holds a UI preference only.
 */
import { readCookie } from "./http";

export const THEME_COOKIE = "theme";
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

const ONE_YEAR = 60 * 60 * 24 * 365;

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

/** Reads the preference from a `Cookie` header; anything unknown falls back to "system". */
export function themeFromCookieHeader(cookieHeader: string | null): Theme {
  const value = readCookie(cookieHeader, THEME_COOKIE);
  return isTheme(value) ? value : "system";
}

/** Serializes the preference cookie. "system" deletes the cookie. */
export function themeCookie(theme: Theme, secure: boolean): string {
  const attributes = ["Path=/", "SameSite=Lax", ...(secure ? ["Secure"] : [])];
  if (theme === "system") {
    return [`${THEME_COOKIE}=`, "Max-Age=0", ...attributes].join("; ");
  }
  return [`${THEME_COOKIE}=${theme}`, `Max-Age=${ONE_YEAR}`, ...attributes].join("; ");
}

/** Value for the `data-theme` attribute on <html>; undefined lets the system setting decide. */
export function themeAttribute(theme: Theme): "light" | "dark" | undefined {
  return theme === "system" ? undefined : theme;
}
