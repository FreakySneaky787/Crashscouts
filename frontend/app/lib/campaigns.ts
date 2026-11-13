/** Campaigns (WP 3A.2): types and pure helpers; unit-tested. */
import type { CampaignStatus } from "~/components/ui/statuses";

import type { CatalogItem } from "./profile";

export type CampaignState = "draft" | "published" | "completed" | "cancelled";
export type CampaignStatusCode = "draft" | "open" | "full" | "in_progress" | "completed" | "cancelled";

export type Campaign = {
  project: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  version: string;
  changelog: string;
  hardware_requirements: string;
  prerequisites: string;
  methodology: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  target_testers: number;
  platforms: CatalogItem[];
  visibility: "public" | "private";
  participation: "direct" | "approval" | "invitation";
  state: CampaignState;
  status: CampaignStatusCode;
  participant_count: number;
  can_edit: boolean;
  created_at: string;
  updated_at: string;
};

const STATUS_LABELS: Record<CampaignStatusCode, CampaignStatus> = {
  draft: "Draft",
  open: "Open",
  full: "Full",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** Key into the design system's campaign status map (tone and icon). */
export function campaignStatusStyleKey(status: CampaignStatusCode): CampaignStatus {
  return STATUS_LABELS[status] ?? "Draft";
}

export const DEFAULT_TIME_ZONE = "Europe/Zurich";

/** IANA time zones known to this runtime, plus UTC; sorted. */
export function timeZones(): string[] {
  const zones = new Set(Intl.supportedValuesOf("timeZone"));
  zones.add("UTC");
  return [...zones].sort();
}

/** Time zones grouped by region (the part before the first slash) for a select with groups. */
export function groupedTimeZones(zones: string[]): { label: string; options: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const zone of zones) {
    const region = zone.includes("/") ? (zone.split("/")[0] ?? "Other") : "Other";
    groups.set(region, [...(groups.get(region) ?? []), zone]);
  }
  return [...groups.entries()].map(([label, options]) => ({ label, options }));
}

/** True for any time zone this runtime knows, including names it lists under an older alias. */
export function isTimeZone(name: string): boolean {
  if (!name) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

function zoneParts(instant: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? NaN);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

/** Offset of the zone from UTC at that instant, in milliseconds. */
function offsetAt(instant: number, timeZone: string): number {
  const p = zoneParts(instant, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(instant / 1000) * 1000;
}

const LOCAL_INPUT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * "2026-11-20T09:00" in the given zone → ISO instant in UTC; null for invalid input or zone.
 * Two passes, so it also holds on days when the offset changes (daylight saving time).
 */
export function zonedToUtc(local: string, timeZone: string): string | null {
  const match = LOCAL_INPUT.exec(local);
  if (!match || !isTimeZone(timeZone)) return null;
  const [year = NaN, month = NaN, day = NaN, hour = NaN, minute = NaN] = match.slice(1).map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  const first = naive - offsetAt(naive, timeZone);
  const second = naive - offsetAt(first, timeZone);
  return new Date(second).toISOString();
}

/** ISO instant → "YYYY-MM-DDTHH:MM" in the zone, for a datetime-local input. */
export function utcToZonedInput(iso: string, timeZone: string): string {
  const instant = Date.parse(iso);
  if (Number.isNaN(instant)) return "";
  const p = zoneParts(instant, timeZone);
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** Human-readable date and time in the campaign's zone, e.g. "20 Nov 2026, 09:00". */
export function formatInZone(iso: string, timeZone: string, locale = "en-GB"): string {
  return new Intl.DateTimeFormat(locale, { timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

/**
 * The create/edit form as API payload. Visibility and participation are only sent while the form
 * offers them (they are frozen after publishing); participation only for public campaigns.
 * Returns field errors for dates that cannot be read.
 */
export function campaignPayload(form: FormData) {
  const text = (name: string) => String(form.get(name) ?? "");
  const timezone = text("timezone") || DEFAULT_TIME_ZONE;
  const errors: Record<string, string> = {};
  const startsAt = zonedToUtc(text("starts_at"), timezone);
  const endsAt = zonedToUtc(text("ends_at"), timezone);
  if (!startsAt) errors.starts_at = "invalid";
  if (!endsAt) errors.ends_at = "invalid";
  const values: Record<string, unknown> = {
    slug: text("slug").trim().toLowerCase(),
    title: text("title"),
    summary: text("summary"),
    description: text("description"),
    version: text("version"),
    changelog: text("changelog"),
    hardware_requirements: text("hardware_requirements"),
    prerequisites: text("prerequisites"),
    methodology: text("methodology"),
    starts_at: startsAt,
    ends_at: endsAt,
    timezone,
    target_testers: Number.parseInt(text("target_testers"), 10),
    platforms: form.getAll("platforms").map(String),
  };
  if (form.has("visibility")) {
    const visibility = text("visibility") === "public" ? "public" : "private";
    values.visibility = visibility;
    if (visibility === "public") values.participation = text("participation") === "approval" ? "approval" : "direct";
  }
  return { values, errors };
}

/** What the form shows again after an error: the raw inputs, not the converted ones. */
export function campaignFormEcho(form: FormData) {
  const text = (name: string) => String(form.get(name) ?? "");
  return {
    slug: text("slug"),
    title: text("title"),
    summary: text("summary"),
    description: text("description"),
    version: text("version"),
    changelog: text("changelog"),
    hardware_requirements: text("hardware_requirements"),
    prerequisites: text("prerequisites"),
    methodology: text("methodology"),
    starts_at: text("starts_at"),
    ends_at: text("ends_at"),
    timezone: text("timezone") || DEFAULT_TIME_ZONE,
    target_testers: text("target_testers"),
    platforms: form.getAll("platforms").map(String),
    visibility: text("visibility") === "public" ? "public" : "private",
    participation: text("participation") === "approval" ? "approval" : "direct",
  };
}

export type CampaignFormValues = ReturnType<typeof campaignFormEcho>;

/** Form values from a stored campaign (times in its own zone). */
export function campaignFormValues(campaign: Campaign): CampaignFormValues {
  return {
    slug: campaign.slug,
    title: campaign.title,
    summary: campaign.summary,
    description: campaign.description,
    version: campaign.version,
    changelog: campaign.changelog,
    hardware_requirements: campaign.hardware_requirements,
    prerequisites: campaign.prerequisites,
    methodology: campaign.methodology,
    starts_at: utcToZonedInput(campaign.starts_at, campaign.timezone),
    ends_at: utcToZonedInput(campaign.ends_at, campaign.timezone),
    timezone: campaign.timezone,
    target_testers: String(campaign.target_testers),
    platforms: campaign.platforms.map((p) => p.slug),
    visibility: campaign.visibility,
    participation: campaign.participation === "approval" ? "approval" : "direct",
  };
}

export type CampaignLink = {
  id: string;
  label: string;
  url: string;
  host: string;
  platform: CatalogItem | null;
  sha256: string;
  in_repository: boolean;
};

/** The add-link form as API payload. */
export function linkPayload(form: FormData) {
  const platform = String(form.get("platform") ?? "");
  return {
    label: String(form.get("label") ?? ""),
    url: String(form.get("url") ?? "").trim(),
    platform: platform || null,
    sha256: String(form.get("sha256") ?? "").trim(),
  };
}

/** Groups a SHA-256 in blocks of eight so people can compare it piece by piece. */
export function groupedChecksum(sha256: string): string {
  return sha256.match(/.{1,8}/g)?.join(" ") ?? "";
}

/** Problems the API reports as {"code": "..."} for campaigns. */
export const CAMPAIGN_PROBLEMS = [
  "public_campaigns_locked",
  "project_not_public",
  "invalid_transition",
  "locked_after_publish",
  "campaign_closed",
  "not_a_draft",
  "below_participants",
  "email_unconfirmed",
  "too_many_links",
] as const;
export type CampaignProblem = (typeof CAMPAIGN_PROBLEMS)[number] | "rateLimited" | "forbidden" | "invalid" | "confirmDelete" | "confirmCancel" | "generic";

export function campaignProblem(status: number, body: unknown): CampaignProblem {
  if (status === 429) return "rateLimited";
  const code = body && typeof body === "object" ? (body as { code?: unknown }).code : undefined;
  if (typeof code === "string" && (CAMPAIGN_PROBLEMS as readonly string[]).includes(code)) return code as CampaignProblem;
  return status === 403 ? "forbidden" : "generic";
}
