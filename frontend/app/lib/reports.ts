/** Reporting (WP 3B.2): targets and reasons; pure helpers, unit-tested. */
import { isUuid } from "./http";
import { isValidProjectSlug } from "./projects";

export const REPORT_REASONS = ["malware", "deception", "not_own_software", "spam", "legal", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export type ReportTarget = {
  type: "project" | "campaign" | "link";
  project: string;
  campaign?: string;
  link?: string;
  /** Where the person returns after reporting. */
  back: string;
};

/** The target from the query (?type=link&project=…&campaign=…&link=…); null if malformed. */
export function reportTarget(params: URLSearchParams): ReportTarget | null {
  const type = params.get("type");
  const project = params.get("project") ?? "";
  if (!isValidProjectSlug(project)) return null;
  if (type === "project") return { type, project, back: `/p/${project}` };
  const campaign = params.get("campaign") ?? "";
  if (!isValidProjectSlug(campaign)) return null;
  const back = `/p/${project}/c/${campaign}`;
  if (type === "campaign") return { type, project, campaign, back };
  const link = params.get("link") ?? "";
  if (type === "link" && isUuid(link)) return { type, project, campaign, link, back };
  return null;
}

/** Address of the report page for a target. */
export function reportHref(target: Omit<ReportTarget, "back">): string {
  const query = new URLSearchParams({ type: target.type, project: target.project });
  if (target.campaign) query.set("campaign", target.campaign);
  if (target.link) query.set("link", target.link);
  return `/report?${query}`;
}
