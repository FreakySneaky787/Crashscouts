/** Shapes of the project API and pure helpers (unit-tested). */
import type { ProjectStatus as StatusLabel } from "~/components/ui/statuses";

import type { CatalogItem } from "./profile";

export const PROJECT_STATUSES = ["development", "alpha", "beta", "stable", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export type License = { spdx_id: string; name: string; open_source: boolean };

export type Project = {
  slug: string;
  name: string;
  summary: string;
  description: string;
  status: ProjectStatus;
  visibility: "public" | "private";
  license: License;
  open_source: boolean;
  repository_url: string;
  categories: CatalogItem[];
  platforms: CatalogItem[];
  languages: CatalogItem[];
  /** What kind of software it is (WP 6.1), e.g. desktop app or library. */
  software_types: CatalogItem[];
  team: { username: string; role: "owner" | "maintainer" }[];
  role: "owner" | "maintainer" | null;
  logo_key: string | null;
  screenshots: { key: string; alt_text: string; width: number; height: number }[];
  /** How the repository link was verified (WP 2.5); null while it is not verified. */
  verification_method: "file" | "github" | null;
  /** Block by moderators with reason and appeal state; for the team only (WP 3B.3). */
  moderation: import("./moderation").ModerationInfo | null;
  created_at: string;
  updated_at: string;
};

/** Shown first in the licence selection; the full SPDX list follows. */
export const COMMON_LICENSES = [
  "MIT",
  "Apache-2.0",
  "GPL-3.0-only",
  "GPL-3.0-or-later",
  "AGPL-3.0-only",
  "AGPL-3.0-or-later",
  "LGPL-3.0-only",
  "MPL-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "Unlicense",
  "LicenseRef-Proprietary",
] as const;

/** Same rule as the backend: 3 to 40 characters, lowercase letters, digits and single hyphens. */
export function isValidProjectSlug(value: string | undefined): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(value) && !value.includes("--");
}

const STATUS_LABELS: Record<ProjectStatus, StatusLabel> = {
  development: "Development",
  alpha: "Alpha",
  beta: "Beta",
  stable: "Stable",
  archived: "Archived",
};

export function statusLabel(status: ProjectStatus): StatusLabel {
  return STATUS_LABELS[status];
}

/** The create/edit form as API payload. Unchecked checkboxes are simply absent. */
export function projectPayload(form: FormData) {
  return {
    slug: String(form.get("slug") ?? "").trim().toLowerCase(),
    name: String(form.get("name") ?? ""),
    summary: String(form.get("summary") ?? ""),
    description: String(form.get("description") ?? ""),
    status: String(form.get("status") ?? "development"),
    visibility: form.get("visibility") === "public" ? "public" : "private",
    license: String(form.get("license") ?? ""),
    repository_url: String(form.get("repository_url") ?? "").trim(),
    categories: form.getAll("categories").map(String),
    platforms: form.getAll("platforms").map(String),
    languages: form.getAll("languages").map(String),
    software_types: form.getAll("software_types").map(String),
  };
}

export type ProjectFormValues = ReturnType<typeof projectPayload>;

/** First error code per field from the API ({"slug": ["slug_taken"]}). */
export function projectErrorCodes(body: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (!body || typeof body !== "object") return result;
  for (const [field, codes] of Object.entries(body as Record<string, unknown>)) {
    if (Array.isArray(codes) && typeof codes[0] === "string") result[field] = codes[0];
  }
  return result;
}

/** Browser URL of a project logo or screenshot (SSR resource route). */
export function projectImageSrc(key: string | null | undefined): string | null {
  return key ? `/project-images/${key}` : null;
}
