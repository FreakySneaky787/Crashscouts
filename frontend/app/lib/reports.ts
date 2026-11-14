/** Reporting (WP 3B.2; people and published feedback since WP 7.1): targets and reasons; pure
 * helpers, unit-tested. */
import { isUuid } from "./http";
import { isValidUsername } from "./profile";
import { isValidProjectSlug } from "./projects";

export const REPORT_REASONS = ["malware", "deception", "not_own_software", "spam", "legal", "other"] as const;
/** Reasons for reporting a person, and for published feedback (owner's decision 2026-11-14). */
export const USER_REPORT_REASONS = ["spam", "harassment", "impersonation", "inappropriate_profile", "other"] as const;
export const FEEDBACK_REPORT_REASONS = ["spam", "harassment", "deception", "legal", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number] | (typeof USER_REPORT_REASONS)[number] | (typeof FEEDBACK_REPORT_REASONS)[number];

export type ReportTarget = {
  type: "project" | "campaign" | "link" | "user" | "feedback";
  project: string;
  campaign?: string;
  link?: string;
  username?: string;
  feedback?: string;
  /** Where the person returns after reporting. */
  back: string;
};

/** The reasons offered for a kind of target (the server checks them the same way). */
export function reasonsFor(type: ReportTarget["type"]): readonly ReportReason[] {
  if (type === "user") return USER_REPORT_REASONS;
  if (type === "feedback") return FEEDBACK_REPORT_REASONS;
  return REPORT_REASONS;
}

/** The target from the query (?type=link&project=…&campaign=…&link=…); null if malformed. */
export function reportTarget(params: URLSearchParams): ReportTarget | null {
  const type = params.get("type");
  if (type === "user") {
    const username = (params.get("username") ?? "").toLowerCase();
    return isValidUsername(username) ? { type, project: "", username, back: `/u/${username}` } : null;
  }
  const project = params.get("project") ?? "";
  if (!isValidProjectSlug(project)) return null;
  if (type === "project") return { type, project, back: `/p/${project}` };
  const campaign = params.get("campaign") ?? "";
  if (!isValidProjectSlug(campaign)) return null;
  const back = `/p/${project}/c/${campaign}`;
  if (type === "campaign") return { type, project, campaign, back };
  const feedback = params.get("feedback") ?? "";
  if (type === "feedback") return isUuid(feedback) ? { type, project, campaign, feedback, back: `${back}/feedback/${feedback}` } : null;
  const link = params.get("link") ?? "";
  if (type === "link" && isUuid(link)) return { type, project, campaign, link, back };
  return null;
}

/** Address of the report page for a target. */
export function reportHref(target: Omit<ReportTarget, "back">): string {
  const query = new URLSearchParams({ type: target.type });
  if (target.username) query.set("username", target.username);
  if (target.project) query.set("project", target.project);
  if (target.campaign) query.set("campaign", target.campaign);
  if (target.link) query.set("link", target.link);
  if (target.feedback) query.set("feedback", target.feedback);
  return `/report?${query}`;
}
