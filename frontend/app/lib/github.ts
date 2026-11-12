/** Pure helpers for the GitHub login (WP 1.4); unit-tested. */

/** Only GitHub's own authorization page is an acceptable external redirect target. */
export function isGitHubAuthorizeUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.host === "github.com" && parsed.pathname === "/login/oauth/authorize";
  } catch {
    return false;
  }
}

/** Errors allauth reports on the callback page, mapped to the texts we show. */
export function providerErrorKey(error: string | null): "cancelled" | "denied" | "failed" | null {
  if (!error) return null;
  if (error === "cancelled") return "cancelled";
  if (error === "permission_denied") return "denied";
  return "failed";
}

/** A username suggestion from the GitHub login, following our username rules. */
export function suggestUsername(login: string | null | undefined): string {
  const cleaned = (login ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/^[-_]+/, "")
    .slice(0, 30);
  return cleaned.length >= 3 ? cleaned : "";
}
