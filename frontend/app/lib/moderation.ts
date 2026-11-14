/** Moderation (WP 3B.3): types and small helpers. */
import type { ReportReason } from "./reports";

/** What a team sees about a block of its content. */
export type ModerationInfo = {
  block: string;
  category: ReportReason;
  message: string;
  blocked_at: string;
  appeal: "none" | "pending" | "upheld" | "lifted";
};

export type ModerationCase = {
  target_type: "project" | "campaign" | "link" | "feedback" | "user";
  target_id: string;
  reports: number;
  malware: boolean;
  oldest: string;
  /** Null for a person (WP 7.1). */
  project: string | null;
  project_name: string | null;
  title: string;
  campaign?: string;
  feedback?: string;
  username?: string;
  url?: string;
  suspended?: boolean;
  blocked: boolean;
  /** The moderator who took the case (WP 7.3). */
  taken_by: string | null;
};

/** A moderator's purpose-bound access to reported content (WP 7.3, ADR 0028). */
export type ModeratorAccess = {
  id: string;
  moderator: string | null;
  target_type: "project" | "campaign" | "feedback";
  target_label: string;
  reason: string;
  created_at: string;
  expires_at: string;
  active: boolean;
  views: number;
};

/** Kinds of reported content whose text moderators open only through an access. */
export const ACCESS_TYPES = ["project", "campaign", "feedback"] as const;

/** What a suspended person sees (WP 7.2). */
export type SuspensionInfo = {
  id: string;
  category: ReportReason;
  message: string;
  created_at: string;
  ends_at: string | null;
  appeal: "none" | "pending" | "upheld" | "lifted";
};

/** What moderators and admins see about a suspension. */
export type Suspension = SuspensionInfo & {
  user_id: string;
  username: string;
  active: boolean;
  created_by: string | null;
  lifted_at: string | null;
  lifted_by: string | null;
  appeal_text: string;
  appealed_at: string | null;
  appeal_decided_by: string | null;
};

/**
 * The end of a suspension from the moderator's form: the end of the chosen day in UTC, or null
 * for "permanently". Returns "invalid" for anything else.
 */
export function suspensionEnd(permanent: boolean, day: string): string | null | "invalid" {
  if (permanent) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(`${day}T23:59:59Z`))) return "invalid";
  return `${day}T23:59:59Z`;
}

export type CaseDetail = Omit<ModerationCase, "reports" | "malware" | "oldest"> & {
  /** This moderator's valid access to the content (WP 7.3). */
  access?: ModeratorAccess | null;
  /** People only (WP 7.2). */
  suspensions?: Suspension[];
  active_suspension?: string | null;
  can_suspend?: boolean;
  reports: { reason: ReportReason; text: string; status: string; reporter: string | null; created_at: string }[];
  notes: { text: string; created_at: string }[];
  blocks: { id: string; target_type: string; category: ReportReason; message: string; created_at: string; lifted_at: string | null }[];
  active_block: string | null;
};

export type Appeal = {
  block: string;
  target_type: ModerationCase["target_type"];
  target_id: string;
  title: string;
  project: string;
  category: ReportReason;
  message: string;
  appeal_text: string;
  appealed_at: string;
};

export const CASE_TYPES = ["project", "campaign", "link", "feedback", "user"] as const;

export function isCaseType(value: string | undefined): value is ModerationCase["target_type"] {
  return (CASE_TYPES as readonly string[]).includes(value ?? "");
}

/** Where moderators open the reported person or feedback; null when there is no page for it. */
export function caseTargetHref(c: Pick<ModerationCase, "target_type" | "project" | "campaign" | "feedback" | "username" | "blocked">): string | null {
  if (c.target_type === "user" && c.username) return `/u/${c.username}`;
  if (c.target_type === "feedback" && c.feedback && !c.blocked) return `/p/${c.project}/c/${c.campaign}/feedback/${c.feedback}`;
  return null;
}

export const CASE_ACTIONS = ["take", "block", "warn", "dismiss", "lift-suspension"] as const;
export type CaseAction = (typeof CASE_ACTIONS)[number];

type ReviewLink = { id: string; label: string; url: string; sha256: string; review_status: string };

export type Reviews = {
  campaigns: { id: string; title: string; summary: string; description: string; project: string; project_name: string; campaign: string; links: ReviewLink[] }[];
  links: (ReviewLink & { campaign_title: string; project: string; project_name: string; campaign: string })[];
};
