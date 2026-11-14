/** Feedback (phase 5, ADR 0024): types and pure helpers; unit-tested. */
import type { CatalogItem } from "./profile";

export type FeedbackKind = "bug" | "ux" | "feature" | "compatibility" | "general";
export const FEEDBACK_KINDS: FeedbackKind[] = ["bug", "ux", "feature", "compatibility", "general"];

export type FeedbackStatus = "new" | "reviewed" | "confirmed" | "in_progress" | "fixed" | "verified" | "duplicate" | "cannot_reproduce" | "rejected";
/** Statuses the team sets (the author only verifies or reopens a fix). */
export const TEAM_STATUSES: FeedbackStatus[] = ["reviewed", "confirmed", "in_progress", "fixed", "duplicate", "cannot_reproduce", "rejected"];

export type FeedbackResult = "works" | "partly" | "fails";
export const FEEDBACK_RESULTS: FeedbackResult[] = ["works", "partly", "fails"];

export type FeedbackField = "steps" | "expected" | "actual" | "location" | "suggestion" | "solution" | "environment" | "result" | "platform" | "version";

/** Type-specific fields in form order, and which of them are required (ADR 0024). */
export const KIND_FIELDS: Record<FeedbackKind, FeedbackField[]> = {
  bug: ["steps", "expected", "actual", "platform", "version"],
  ux: ["location", "suggestion"],
  feature: ["solution"],
  compatibility: ["platform", "result", "environment", "version"],
  general: [],
};
export const REQUIRED_FIELDS: Partial<Record<FeedbackKind, FeedbackField[]>> = {
  bug: ["steps", "expected", "actual"],
  feature: ["solution"],
  compatibility: ["platform", "result"],
};

export type FeedbackAttachment = { key: string; kind: "image" | "text"; name: string; size: number };

export type Feedback = {
  id: string;
  kind: FeedbackKind;
  title: string;
  description: string;
  steps: string;
  expected: string;
  actual: string;
  location: string;
  suggestion: string;
  solution: string;
  environment: string;
  result: FeedbackResult | "";
  platform: CatalogItem | null;
  version: string;
  task: { id: string; title: string } | null;
  status: FeedbackStatus;
  duplicate_of: { id: string; title: string } | null;
  /** Only for the team and the author; null means "a tester". */
  author: string | null;
  is_mine: boolean;
  published: boolean;
  publish_proposed: boolean;
  author_consented: boolean;
  can_change: boolean;
  can_manage: boolean;
  can_verify: boolean;
  /** A moderators' block (WP 7.1); only for the team and the author. */
  moderation?: import("./moderation").ModerationInfo | null;
  /** Only for the team and the author; empty for everyone else. */
  attachments: FeedbackAttachment[];
  created_at: string;
  updated_at: string;
  history?: { status: FeedbackStatus; role: "team" | "author"; at: string }[];
};

export type MyFeedback = {
  id: string;
  kind: FeedbackKind;
  title: string;
  status: FeedbackStatus;
  published: boolean;
  campaign_title: string;
  campaign_slug: string;
  project_slug: string;
  updated_at: string;
};

export function isFeedbackKind(value: unknown): value is FeedbackKind {
  return typeof value === "string" && (FEEDBACK_KINDS as string[]).includes(value);
}

export function isFeedbackStatus(value: unknown): value is FeedbackStatus {
  return typeof value === "string" && ([...TEAM_STATUSES, "new", "verified"] as string[]).includes(value);
}

const STATUS_STYLE_KEYS: Record<FeedbackStatus, "New" | "Reviewed" | "Confirmed" | "In Progress" | "Fixed" | "Verified" | "Duplicate" | "Cannot Reproduce" | "Rejected"> = {
  new: "New",
  reviewed: "Reviewed",
  confirmed: "Confirmed",
  in_progress: "In Progress",
  fixed: "Fixed",
  verified: "Verified",
  duplicate: "Duplicate",
  cannot_reproduce: "Cannot Reproduce",
  rejected: "Rejected",
};

/** Key into the design system's feedback status map (tone and icon; never colour alone). */
export function feedbackStatusStyleKey(status: FeedbackStatus) {
  return STATUS_STYLE_KEYS[status] ?? "New";
}

/**
 * The feedback form as API payload: common fields plus the fields of the chosen kind only
 * (the server clears the others anyway). Empty optional fields are left out.
 */
export function feedbackPayload(form: FormData, kind: FeedbackKind) {
  const text = (name: string) => String(form.get(name) ?? "");
  const values: Record<string, unknown> = { kind, title: text("title"), description: text("description") };
  for (const field of KIND_FIELDS[kind]) {
    const value = text(field).trim();
    if (field === "platform") values.platform = value || null;
    else if (value) values[field] = value;
  }
  const task = text("task");
  values.task = task || null;
  return values;
}

/** What the form shows again after an error (raw inputs). */
export function feedbackEcho(form: FormData): Record<string, string> {
  const echo: Record<string, string> = {};
  for (const name of ["title", "description", "task", ...new Set(Object.values(KIND_FIELDS).flat())]) echo[name] = String(form.get(name) ?? "");
  return echo;
}

/** Form values from stored feedback (for the edit page). */
export function feedbackValues(feedback: Feedback): Record<string, string> {
  return {
    title: feedback.title,
    description: feedback.description,
    task: feedback.task?.id ?? "",
    steps: feedback.steps,
    expected: feedback.expected,
    actual: feedback.actual,
    location: feedback.location,
    suggestion: feedback.suggestion,
    solution: feedback.solution,
    environment: feedback.environment,
    result: feedback.result,
    platform: feedback.platform?.slug ?? "",
    version: feedback.version,
  };
}

/** Problems the API reports as {"code": "..."} for feedback. */
export const FEEDBACK_PROBLEMS = [
  "not_participant",
  "campaign_closed",
  "blocked",
  "not_author",
  "feedback_locked",
  "invalid_status",
  "invalid_duplicate",
  "not_allowed",
  "not_proposed",
  "invalid_file",
  "too_many_attachments",
] as const;
export type FeedbackProblem = (typeof FEEDBACK_PROBLEMS)[number] | "rateLimited" | "confirmWithdraw" | "invalid" | "generic";

export function feedbackProblem(status: number, body: unknown): FeedbackProblem {
  if (status === 429) return "rateLimited";
  if (status === 413) return "invalid_file";
  const code = body && typeof body === "object" ? (body as { code?: unknown }).code : undefined;
  if (typeof code === "string" && (FEEDBACK_PROBLEMS as readonly string[]).includes(code)) return code as FeedbackProblem;
  return "generic";
}

/** Allowed attachment types for the file picker (the server checks the content itself). */
export const ATTACHMENT_ACCEPT = ".png,.jpg,.jpeg,.webp,.txt,.log,.json,image/png,image/jpeg,image/webp,text/plain,application/json";
export const MAX_ATTACHMENTS = 5;
/** Largest single upload (images 5 MB; text 2 MB is checked by the server) plus form overhead. */
export const MAX_ATTACHMENT_REQUEST_BYTES = 5 * 1024 * 1024 + 64 * 1024;

/** "1.2 MB", "340 KB": sizes for people. */
export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
