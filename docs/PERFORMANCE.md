# Performance at beta scale (WP 8.6)

> Measured on 2026-11-15 on the **local production-like stack** (`compose.prod.yaml`, ADR 0032),
> not on the server. To be repeated on the Infomaniak VPS in WP 8.1 (2 vCPU, 4 GB RAM).

## Target (owner's decision, 2026-11-15)

- Data: about **1,000 accounts, 2,000 projects and 5,000 campaigns**.
- Load: **20 concurrent users**.
- Response time: **95 % of page requests under 500 ms** (p95 per page).

## Method

**Stack.** Caddy → SSR server (`react-router-serve`) → Django under Gunicorn (3 workers) →
PostgreSQL 18, with production settings (`config.settings.prod`). For the load test,
`compose.loadtest.yaml` selects `config.settings.loadtest`, which changes exactly two things and
refuses to start for any address other than `https://localhost`:

- the Discover limit per IP address (`discover_ip`, ADR 0022) is raised, because all simulated
  users share one address locally (the throttle still runs, so its cache writes are measured);
- public campaigns are enabled, so that campaign pages and campaign search are measured. On a real
  server only the owner opens this gate.

**Data.** `manage.py seed_load_data` (generated, no real people; refuses a database with other
accounts) created 1,000 accounts, 2,000 projects (90 % public), 5,000 campaigns (70 % public; 50 %
published, 20 % completed, 20 % drafts, 10 % cancelled), 10,547 participations, 10,583 feedback
entries and 300 open reports, in 7.6 seconds. Twenty accounts get a random password (written to
a file outside the repository); all others cannot sign in. The database is 36 MB.

**Load.** Locust 2.47.0 (`loadtest/locustfile.py`), 20 users started at 2 per second, 5 minutes:

| User | Share | What they do (wait 1–4 s or 2–5 s between requests) |
|---|---|---|
| Visitor | 50 % | home page, Discover with and without search, project, campaign and profile pages |
| Tester | 30 % | signs in once, then account page, campaign pages, Discover |
| Team member | 20 % | signs in once, then own project pages and the feedback inbox of own campaigns |

Every request goes through Caddy with TLS, so the numbers include the SSR server and Django.

**Machine.** Cloud development container with 4 vCPUs and 16 GB RAM; Locust ran on the same
machine and competed for the CPU. The VPS has half the CPUs, so WP 8.1 repeats the run there.

**Caveat on search.** The generated texts use only 26 different words, so a search term matches
about 90 % of all rows (4,519 of 5,000 campaigns for "garden"). That is a worst case for ranking;
real texts match far fewer rows.

## What the measurements found and what was changed

Backend timings are medians of five calls inside the backend container (Django test client,
without HTTP), before and after the change.

| Finding | Before | After | Change |
|---|---|---|---|
| Discover project search computed the search vector for every row on each request | 358 ms | 29 ms | generated, stored `search_vector` column with GIN index (projects) |
| Discover campaign search: the same, joined with the project name | 668 ms | 56 ms | stored column for the campaign's own texts; the project name is matched and ranked from the short name at query time |
| Moderation queue loaded every case on its own (300 open reports) | 883 ms, 606 queries | 33 ms, 12 queries | targets and takers loaded together, one query per kind of target |
| Feedback inbox looked up the team membership three times per entry and each entry's attachments | 26 ms, 22 queries (4 entries) | 13 ms, 8 queries | team decided once per list; attachments prefetched |
| A project's campaign list (team view) looked up the membership about five times per campaign | 112 ms, 114 queries (10 campaigns) | 68 ms, 65 queries | team decided once per list |
| Public profile pages returned 404 behind the proxy | – | fixed | the cookie-free request for public profiles lost `X-Forwarded-Proto`, so Django redirected to HTTPS (a real bug, found only with the proxy; covered by the smoke test now) |

Each change has a regression test that fails when the change is undone (checked by mutation): the
query counts stay the same for more cases, entries and campaigns, and the visibility rules
(strangers see no author, no team fields, no drafts) still hold.

Other backend paths at beta scale, after the changes:

| Path | Time | Queries |
|---|---|---|
| Moderation statistics | 25 ms | 21 |
| Growth metrics page (computed partly in Python) | 81 ms | 5 |
| Campaign reviews queue | 7 ms | 3 |
| Own feedback list (18 entries) | 5 ms | 1 |
| Own participations (21 entries) | 74 ms | 64 |
| Project page / campaign page (team) | 11–19 ms | 10–15 |

## Load test result (20 users, 5 minutes, after all changes)

**Target met: 0 failures in 1,998 requests (6.7 per second); p95 ≤ 150 ms for every page
except the sign-in page.** Times in milliseconds, measured by Locust from request to full response
(through Caddy, the SSR server and Django).

| Page | Requests | p50 | p95 | p99 | max |
|---|---|---|---|---|---|
| `/` home | 155 | 10 | 24 | 43 | 48 |
| `/discover` | 358 | 76 | 140 | 160 | 190 |
| `/discover?q=…` search | 243 | 71 | 120 | 160 | 210 |
| `/p/[project]` | 217 | 39 | 98 | 140 | 160 |
| `/p/[project]` (team) | 140 | 63 | 110 | 130 | 150 |
| `/p/[project]/c/[campaign]` | 362 | 65 | 130 | 140 | 170 |
| `/p/[project]/c/[campaign]/feedback` inbox | 101 | 54 | 130 | 160 | 170 |
| `/u/[username]` profile | 74 | 24 | 47 | 370 | 370 |
| `/account` | 328 | 91 | 150 | 180 | 200 |
| `/login` (page) | 10 | 68 | 570 | 570 | 570 |
| `/login` (sign-in, POST) | 10 | 240 | 310 | 310 | 310 |
| **All requests** | **1,998** | **68** | **130** | **180** | **570** |

**The one value above 500 ms** is the sign-in page: with only 10 requests (one per signed-in
user), its p95 is its slowest single request, the very first request after the stack had been
restarted. Checked separately: after a restart the first two requests to `/login` took 680 and
334 ms, every following one 20–33 ms. It is a cold start, not a load problem; WP 8.1 adds a
warm-up request after each deployment.

Before the changes above (same data, campaigns enabled), Discover search had a p95 of **520 ms**
and the aggregate p95 was **420 ms**.

## Resources during the load test

Highest values from `docker stats` every 15 seconds (18 samples). The whole stack needed about
**545 MiB of memory** at peak, well within the VPS's 4 GB.

| Container | CPU average | CPU peak | Memory peak |
|---|---|---|---|
| Django (Gunicorn, 3 workers) | 31 % | 103 % | 257 MiB |
| SSR server | 32 % | 59 % | 159 MiB |
| PostgreSQL | 16 % | 30 % | 102 MiB |
| Caddy | 2 % | 2 % | 18 MiB |

(100 % = one CPU core.) Django and the SSR server together averaged about two thirds of a core;
the VPS has two.

## Known risks and follow-ups

- **Per-entry counts remain in two lists:** own participations (about 3 queries per entry: task
  progress counts) and a project's campaign list (participants, applications and feedback counts
  per campaign). Both grow with one person's or one project's data, not with the platform; at
  beta scale they stay below 100 ms. Annotating the counts is the next step if they grow.
- **Growth metrics** are computed partly in Python (81 ms now); they grow with all data on the
  platform. Re-measure at ten times the beta data before a public launch.
- **Rate-limit cache in PostgreSQL** (ADR 0022): one write per throttled request. Measured as part
  of the load test (Discover requests); no lock waits or errors showed up. Re-check on the VPS.
- **Sign-in** takes about 240 ms by design (Argon2 password hashing).
- **Cold start:** the first requests after a restart take up to 0.7 s; WP 8.1 adds a warm-up.
- **The VPS has 2 vCPUs** instead of 4: WP 8.1 repeats this run there before the beta starts.

## Reproducing

```bash
docker compose -f compose.prod.yaml -f compose.loadtest.yaml --env-file .env.prod --profile local up -d --no-build
```

```bash
docker compose -f compose.prod.yaml -f compose.loadtest.yaml --env-file .env.prod exec -T backend python manage.py migrate --noinput
```

```bash
docker compose -f compose.prod.yaml -f compose.loadtest.yaml --env-file .env.prod exec -T backend python manage.py seed_load_data --credentials /tmp/logins.json --targets /tmp/targets.json
```

Copy both files out of the container (`docker cp`), keep `logins.json` outside the repository and
put `targets.json` into `loadtest/` (ignored by git), then:

```bash
cd loadtest && LOGINS=/path/outside/the/repository/logins.json uv run --frozen locust -f locustfile.py --headless -u 20 -r 2 -t 5m --host https://localhost --csv results/run --only-summary
```

Build the images first with `scripts/build-images.sh` (ADR 0032). Start from an empty database
(`docker compose ... down -v`): the generator refuses to run twice.
