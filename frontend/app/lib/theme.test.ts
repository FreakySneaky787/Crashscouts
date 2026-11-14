import { describe, expect, it } from "vitest";

import { isTheme, themeAttribute, themeCookie, themeFromCookieHeader } from "./theme";

describe("theme preference", () => {
  it("accepts only the three known values", () => {
    expect(isTheme("dark")).toBe(true);
    expect(isTheme("light")).toBe(true);
    expect(isTheme("system")).toBe(true);
    expect(isTheme("blue")).toBe(false);
    expect(isTheme("dark; Path=/admin")).toBe(false);
    expect(isTheme(undefined)).toBe(false);
  });

  it("reads the cookie and falls back to system", () => {
    expect(themeFromCookieHeader("a=1; theme=dark")).toBe("dark");
    expect(themeFromCookieHeader("theme=light; __Host-theme=dark")).toBe("dark"); // HTTPS name wins
    expect(themeFromCookieHeader("theme=<script>")).toBe("system");
    expect(themeFromCookieHeader(null)).toBe("system");
  });

  it("serializes a long-lived, SameSite=Lax cookie and deletes it for system", () => {
    expect(themeCookie("dark", true)).toBe("__Host-theme=dark; Max-Age=31536000; Path=/; SameSite=Lax; Secure");
    expect(themeCookie("system", true)).toBe("__Host-theme=; Max-Age=0; Path=/; SameSite=Lax; Secure");
    expect(themeCookie("light", false)).toBe("theme=light; Max-Age=31536000; Path=/; SameSite=Lax");
    expect(themeCookie("system", false)).toBe("theme=; Max-Age=0; Path=/; SameSite=Lax");
  });

  it("maps the preference to the html data-theme attribute", () => {
    expect(themeAttribute("dark")).toBe("dark");
    expect(themeAttribute("system")).toBeUndefined();
  });
});
