# 0025 – Discover

- Status: Accepted
- Date: 2026-11-14

## Context

Phase 6 of the MVP plan: find public projects and test campaigns with PostgreSQL full-text
search and filters (master prompt 3.3: operating system, category, programming language,
software type, licence, development status, active test campaigns). Open-source projects shall
be particularly visible, small projects discoverable, other projects clearly labelled (master
prompt 2.1); private campaigns never appear (2.2). The default sort must not favour popular
projects (MVP plan). A software type did not exist yet.

The project owner decided (2026-11-14): two tabs, projects and campaigns; the software type
becomes a project field with a fixed list; default sort "recently active", "new" selectable,
never by popularity; the filter "open source only" is preselected.

## Decision

- **Software type (WP 6.1):** catalog list `SoftwareType` (desktop app, mobile app, web app,
  command-line tool, library or framework, game, server or self-hosted, browser extension),
  several per project.
- **App `apps.discover`** with queries only (no tables): `GET /api/v1/discover/projects/` and
  `GET /api/v1/discover/campaigns/`, public and read-only.
- **What appears:** public, unblocked projects; campaigns that are public, published, unblocked
  and belong to a public, unblocked project – and none while public campaigns are locked
  (`PUBLIC_CAMPAIGNS_ENABLED`). Drafts, campaigns in review, completed, cancelled and private
  content never appear, also not through a search term. Full campaigns appear with their status.
- **Open source:** `open_source` is on unless the request says `open_source=all`; every result
  carries `open_source` (from the licence's OSI flag) so the page can label it.
- **Sorting:** `active` (default) by the latest of the project's own change and the change of its
  live public campaigns (for campaigns: their own change or publication), then by creation date;
  `new` by creation date. Nothing else – no participant counts, no feedback counts.
- **Search:** PostgreSQL full text with the `simple` configuration (no stemming: German and
  English content), every word must match, each also as a prefix (`sync` finds `synchronises`).
  Only word characters reach the query (at most 8 words of at most 40 characters), so a search
  term cannot inject tsquery syntax. Projects: name (weight A), summary (B), description (C);
  campaigns: title (A), project name and summary (B), description (C). With a search term, results
  are ordered by rank, then by the chosen sort. Vectors are computed at query time; a GIN index
  follows when measurements need it (before the beta).
- **Filters:** projects – platform, category, language, software type, development status, "has
  a live campaign"; campaigns – the project's category, language, software type and licence, the
  campaign's platform, testing method and "free places only". Unknown values match nothing.
- **Paging:** 20 per page; pages beyond the last show the last page.
- **Rate limit:** 120 requests per minute and IP address (`discover_ip`, ADR 0022).

## Alternatives

- Deriving the software type from categories and platforms: no "desktop" or "library"
  (rejected by the owner).
- Showing all licences by default with labels only: the owner chose to preselect open source.
- Stemming with the English configuration: wrong for German texts; a per-project language field
  would be needed first.

## Consequences

- Closed-source projects are found only after unticking "open source only".
- The campaigns tab stays empty until the owner opens the security gate.
- Search cost grows with the number of public projects; to be measured before the beta.
