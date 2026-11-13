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
  target_type: "project" | "campaign" | "link";
  target_id: string;
  reports: number;
  malware: boolean;
  oldest: string;
  project: string;
  project_name: string;
  title: string;
  campaign?: string;
  url?: string;
  suspended?: boolean;
  blocked: boolean;
};

export type CaseDetail = Omit<ModerationCase, "reports" | "malware" | "oldest"> & {
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

export const CASE_TYPES = ["project", "campaign", "link"] as const;

export function isCaseType(value: string | undefined): value is ModerationCase["target_type"] {
  return (CASE_TYPES as readonly string[]).includes(value ?? "");
}

export const CASE_ACTIONS = ["take", "block", "warn", "dismiss", "lift-suspension"] as const;
export type CaseAction = (typeof CASE_ACTIONS)[number];
