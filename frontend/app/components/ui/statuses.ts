/**
 * Mapping of domain statuses to a semantic tone and an icon. Status is never shown by colour
 * alone: every status renders with an icon and its text label (docs/DESIGN-SYSTEM.md).
 */
import {
  CheckCircleIcon,
  CircleHalfIcon,
  CircleIcon,
  HourglassMediumIcon,
  ProhibitIcon,
  UsersIcon,
  XCircleIcon,
  type IconComponent,
} from "./icons";

export type Tone = "ok" | "warn" | "danger" | "info" | "neutral";
export type StatusStyle = { tone: Tone; icon?: IconComponent };

export const CAMPAIGN_STATUS = {
  Draft: { tone: "neutral", icon: CircleIcon },
  "In Review": { tone: "warn", icon: HourglassMediumIcon },
  Open: { tone: "ok", icon: CircleIcon },
  Full: { tone: "warn", icon: UsersIcon },
  "In Progress": { tone: "info", icon: CircleHalfIcon },
  Completed: { tone: "neutral", icon: CheckCircleIcon },
  Cancelled: { tone: "danger", icon: XCircleIcon },
} as const satisfies Record<string, StatusStyle>;

export const FEEDBACK_STATUS = {
  New: { tone: "info" },
  Reviewed: { tone: "neutral" },
  Confirmed: { tone: "warn" },
  "In Progress": { tone: "info", icon: CircleHalfIcon },
  Fixed: { tone: "ok", icon: CheckCircleIcon },
  Verified: { tone: "ok", icon: CheckCircleIcon },
  Duplicate: { tone: "neutral" },
  "Cannot Reproduce": { tone: "neutral" },
  Rejected: { tone: "neutral" },
} as const satisfies Record<string, StatusStyle>;

export const TASK_STATUS = {
  "Not Started": { tone: "neutral", icon: CircleIcon },
  "In Progress": { tone: "info", icon: CircleHalfIcon },
  Completed: { tone: "ok", icon: CheckCircleIcon },
  Blocked: { tone: "danger", icon: ProhibitIcon },
} as const satisfies Record<string, StatusStyle>;

export const PROJECT_STATUS = {
  Development: { tone: "neutral" },
  Alpha: { tone: "warn" },
  Beta: { tone: "info" },
  Stable: { tone: "ok" },
  Archived: { tone: "neutral" },
} as const satisfies Record<string, StatusStyle>;

export type CampaignStatus = keyof typeof CAMPAIGN_STATUS;
export type FeedbackStatus = keyof typeof FEEDBACK_STATUS;
export type TaskStatus = keyof typeof TASK_STATUS;
export type ProjectStatus = keyof typeof PROJECT_STATUS;
