# 0030 – Growth metrics page

- Status: Accepted
- Date: 2026-11-15

## Context

The project owner defined five growth metrics on 2026-11-13 ([`METRICS.md`](../METRICS.md)):
time to first tester, campaign completion rate, useful feedback rate, returning testers and
returning developers. They are computed from the platform's own data, as aggregates only, and
shown internally to platform admins (WP M.1). The owner decided on 2026-11-15 to build the page
now, before phase 8.

## Decision

- **App `apps.metrics`** with queries only (no tables): `GET /api/v1/platform/metrics/`, **admins
  only** (404 for everyone else), `Cache-Control: private, no-store`. Frontend
  `/platform/metrics`, linked for admins from the account page and the moderation page.
- **Periods:** the last 12 calendar months in UTC and all time. Metrics 1–3 by the month of
  publication (`published_at`); metrics 4–5 by cohort (month of the first participation or
  publication). The month buckets are shared with the moderation statistics (`core/months.py`).
- **Exact rules on top of METRICS.md:**
  - only campaigns with `published_at` count;
  - participations with status "active" or "left" count, "removed" ones never (metrics 1 and 4);
  - time to first tester = median of (earliest counted participation − publication), in hours,
    plus the number and share of campaigns without a participant so far;
  - useful feedback = any status except duplicate, cannot reproduce and rejected;
  - returning developers count the account in `published_by`; deleted accounts (NULL) drop out;
  - a share whose denominator is 0 is `null` and shown as "–".
- **Only numbers** reach the page: counts, shares, medians; no names, no single campaigns.
- Computed at request time; no snapshots, no tracking.

## Alternatives

- Pre-computed monthly snapshots: not needed at the expected volume; can follow if the queries
  get slow (measure in phase 8).
- Counting removed participations as "first tester": a removed person was in the campaign, but
  metric 4 already excludes them; one rule for both keeps the numbers comparable.

## Consequences

- Small numbers in the first months make shares jump; the page always shows the counts next to
  the shares.
- Unprocessed feedback counts as useful (owner's decision), so the useful feedback rate is an
  upper bound.
