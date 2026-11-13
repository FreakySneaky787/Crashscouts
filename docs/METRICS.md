# Metrics concept

> Decided by the project owner on 2026-11-13. The five growth metrics below are the platform's
> measure of success for marketing and product decisions.

## Principles

- **Own data only.** Every metric is computed on the server from the platform's own database
  (campaigns, participations, feedback). No tracking cookies, no analytics scripts, no third-party
  services, no cookie banner.
- **Aggregates only.** The metrics show counts, shares and medians – never individual people.
- **Internal.** Only platform admins see them, on an internal statistics page (WP M.1, after
  phase 5). Nothing is published.
- **Deliberately not measured:** page views, visitor origin, click paths, sessions.
- Deleted accounts drop out: references to them are set to NULL (e.g. `published_by`), so they no
  longer count as a person; the campaigns themselves still count.

## The five metrics

Period: per calendar month in which the campaign was **published** (`Campaign.published_at`),
unless stated otherwise. Only published campaigns count; drafts never.

### 1. Time to First Tester

- **Question:** How long does it take a developer until the first suitable tester joins?
- **Definition:** for each published campaign, the time from `published_at` to the first active
  participation (owner's decision: the first participation counts, whichever way it came in –
  direct joining, accepted invitation or approved application).
- **Formula:** median of `first_participation.created_at − published_at` over the campaigns of
  the period; also the share of campaigns without any participant so far.
- **Data:** `Campaign.published_at`; `Participation.created_at` (a person's participation row is
  kept and reactivated when they come back, so `created_at` is their first joining).
- **Limits:** says nothing about tester quality; campaigns that never get a tester appear only in
  the "no participant yet" share.

### 2. Campaign Completion Rate

- **Question:** How many started test campaigns are actually completed?
- **Definition:** completed campaigns divided by campaigns that have ended (completed or
  cancelled). Running campaigns do not count yet.
- **Formula:** `count(state = completed) / count(state in {completed, cancelled})`.
- **Data:** `Campaign.state`, `completed_at`, `cancelled_at`.
- **Limits:** "Completed" is set by the team by hand (decision C); a team that never closes its
  campaigns is not counted until it does.

### 3. Useful Feedback Rate

- **Question:** How many campaigns receive at least one useful piece of feedback?
- **Definition:** share of **completed** campaigns with at least one feedback whose status is not
  "Duplicate", "Cannot Reproduce" or "Rejected" (owner's decision: every feedback that was not
  turned down counts, including unprocessed feedback).
- **Data:** feedback and its status (phase 5). Measurable from phase 5 on.
- **Limits:** counts unprocessed feedback as useful; a team that rejects nothing raises the rate.

### 4. Returning Testers

- **Question:** How many testers take part in a campaign again?
- **Definition:** among people with at least one participation, the share who took part in at
  least two different campaigns. Removed participations do not count; left ones do (the person
  did take part).
- **Formula:** `count(users with ≥ 2 campaigns) / count(users with ≥ 1 campaign)`, per month of
  the first participation (cohort) and overall.
- **Data:** `Participation` (status `active` or `left`).

### 5. Returning Developers

- **Question:** How many developers publish a second test campaign?
- **Definition:** among accounts that published at least one campaign, the share that published
  at least two.
- **Formula:** `count(accounts with ≥ 2 published campaigns) / count(accounts with ≥ 1)`, per
  month of the first publication (cohort) and overall.
- **Data:** `Campaign.published_by` (the account that pressed "Publish").
- **Limits:** counts the publishing account, not the project; in a team, whoever publishes gets
  the credit.

## Data foundation and implementation

- **WP 3A.4b (✅ implemented):** `Campaign.published_at`, `completed_at`, `cancelled_at` and
  `published_by` (`SET_NULL`), set in `services.change_state`; migration
  `campaigns/0006_backfill_state_timestamps` fills them for existing campaigns from the audit
  events (tested).
- **Phase 5:** feedback with status (needed for metric 3).
- **WP M.1 (after phase 5):** internal statistics page for platform admins, computed with
  aggregate database queries; tests with fixed example data per metric.
