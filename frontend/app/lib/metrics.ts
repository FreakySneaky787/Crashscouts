/** Growth metrics (WP M.1, ADR 0030, docs/METRICS.md): types and formatting, unit-tested. */

type Share = { rate: number | null };

export type CampaignFigures = {
  time_to_first_tester: { campaigns: number; median_hours: number | null; without_tester: number; without_tester_share: number | null };
  completion_rate: Share & { completed: number; ended: number };
  useful_feedback_rate: Share & { with_useful_feedback: number; completed: number };
};

export type Returning = Share & { people: number; returning: number };

export type GrowthMetrics = {
  generated_at: string;
  all_time: CampaignFigures & { returning_testers: Returning; returning_developers: Returning };
  months: (CampaignFigures & { month: string; returning_testers: Returning; returning_developers: Returning })[];
};

/** "2 d 4 h", "5 h", "under 1 h" or "–" for no value. */
export function formatHours(hours: number | null): string {
  if (hours === null) return "–";
  if (hours < 1) return "under 1 h";
  const rounded = Math.round(hours);
  const days = Math.floor(rounded / 24);
  const rest = rounded % 24;
  if (!days) return `${rest} h`;
  return rest ? `${days} d ${rest} h` : `${days} d`;
}

/** "40 %" (whole percent) or "–" when the denominator was 0. */
export function formatShare(rate: number | null): string {
  return rate === null ? "–" : `${Math.round(rate * 100)} %`;
}
