# 0029 – Moderation statistics

- Status: Accepted
- Date: 2026-11-14

## Context

Phase 7 of the MVP plan lists "statistics". The project owner decided (2026-11-14) that phase 7
gets a **moderation statistics** page for admins; the growth metrics of
[`METRICS.md`](../METRICS.md) stay in WP M.1. Any moderator may suspend and decide appeals
(ADR 0027), so admins need an overview of how moderation works, without looking at single cases.

## Decision

- `GET /api/v1/moderation/statistics/` (**admins only**, 404 for everyone else, `no-store`),
  frontend `/moderation/statistics` linked from the moderation page for admins.
- **Right now:** open cases (reported objects with open reports), open reports, active blocks,
  open appeals (blocks and suspensions).
- **Per calendar month (UTC), the last 12 months, newest first:** reports sent, by reason and by
  kind of target; reports resolved and dismissed and the mean hours from report to decision (in the
  month of the decision); blocks and block appeals; suspensions, of them permanent; suspension
  appeals and how they were decided; moderator accesses opened.
- **Sums only:** no names, no single cases, no texts; computed from the moderation tables at
  request time (no extra storage, no tracking, as for the growth metrics).

## Alternatives

- Storing daily snapshots: not needed at the expected volume; can follow when queries get slow.
- Statistics per moderator: would turn the page into staff monitoring; the admins' lists of
  suspensions and accesses already show who acted where that matters.

## Consequences

- The page answers questions such as "are reports decided quickly", "how often are suspensions
  permanent", "how often are appeals accepted".
- Wide tables scroll inside a focusable, labelled region so keyboard users can reach them (WCAG
  2.1.1; axe `scrollable-region-focusable`); applied to the other admin tables as well.
