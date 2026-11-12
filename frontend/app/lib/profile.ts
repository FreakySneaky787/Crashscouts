/** Shapes of the profile API and small pure helpers (unit-tested). */

export type CatalogItem = { slug: string; name: string };
export type Catalog = { categories: CatalogItem[]; platforms: CatalogItem[]; skills: CatalogItem[] };

export type PublicProfile = {
  username: string;
  avatar_key: string | null;
  indexable: boolean;
  bio?: string;
  link?: string;
  interests?: CatalogItem[];
  platforms?: CatalogItem[];
  skills?: CatalogItem[];
};

export type OwnProfile = {
  username: string;
  avatar_key: string | null;
  bio: string;
  link: string;
  interests: string[];
  platforms: string[];
  skills: string[];
  show_bio: boolean;
  show_link: boolean;
  show_interests: boolean;
  show_platforms: boolean;
  show_skills: boolean;
  indexable: boolean;
};

export const VISIBILITY_FIELDS = ["show_bio", "show_link", "show_interests", "show_platforms", "show_skills"] as const;
export const LIST_FIELDS = ["interests", "platforms", "skills"] as const;

/** Same rule as the backend: 3 to 30 characters, lowercase letters, digits, "-" and "_". */
export function isValidUsername(value: string | undefined): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9_-]{2,29}$/.test(value);
}

/** Browser URL of an avatar, served by the SSR server's resource route. */
export function avatarSrc(key: string | null | undefined): string | null {
  return key ? `/avatars/${key}` : null;
}

/** Turns the settings form into the PATCH payload. Unchecked checkboxes are simply absent. */
export function profilePayload(form: FormData) {
  const payload: Record<string, unknown> = {
    bio: String(form.get("bio") ?? ""),
    link: String(form.get("link") ?? "").trim(),
    indexable: form.get("indexable") === "on",
  };
  for (const field of LIST_FIELDS) payload[field] = form.getAll(field).map(String);
  for (const field of VISIBILITY_FIELDS) payload[field] = form.get(field) === "on";
  return payload;
}

/** Display host of a profile link, e.g. "example.org" (the full URL stays in href). */
export function linkLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return url;
  }
}
