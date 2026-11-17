# 0034 – Monitoring and logs

- Status: Accepted
- Date: 2026-11-17

## Context

Since 2026-11-16 the platform runs on one server ([OPERATIONS.md](../OPERATIONS.md)), with
scheduled jobs and a nightly backup ([ADR 0033](0033-backups.md)). Nobody would notice any of
these failures:

- the site is down;
- a job or the backup fails;
- the disk fills up;
- the backend has a server error.

The container logs grow without a limit. They and the SSH logs contain IP addresses, and the
privacy policy left their retention open (question Y).

## Decision

### Alerts

- **Service (owner's decision 2026-11-17): Healthchecks.io**, a dead man's switch.
  - The server sends a signal after every run.
  - When a signal is missing or reports a failure, Healthchecks.io emails the owner.
  - A server that is completely down sends nothing, so one service covers both the jobs and
    availability.
- **Checked on the official pages (2026-11-17):**
  - [pricing](https://healthchecks.io/pricing/): the free "Hobbyist" plan monitors 20 jobs and
    keeps 100 log entries per job; the Business plan is offered free of charge to open-source
    projects;
  - [FAQ](https://healthchecks.io/docs/faq/): run by SIA Monkey See Monkey Do (Latvia), data on
    Hetzner servers in Germany. Commercial use of the free plan is "tolerated". The company does
    **not** sign processing agreements: it sees itself as a controller of its customers' account
    data and asks customers not to send personal data;
  - [pinging API](https://healthchecks.io/docs/http_api/): `https://hc-ping.com/<ping key>/<slug>`,
    with a suffix of `/fail` or an exit status 0–255; at most 5 pings per minute per check.
- **Consequence: no personal data reaches Healthchecks.io.** `scripts/hc-ping.sh` sends an empty
  request with the exit status only; no log lines and no request body. The privacy policy needs
  no new recipient for this.

### Checks

| Check (slug) | Source | Period | Grace (suggested) |
|---|---|---|---|
| `crashscouts-site` | `scripts/monitor.sh`: `https://<host>/discover` answers 200 (Caddy, SSR server, Django, PostgreSQL) | 5 min | 10 min |
| `crashscouts-disk` | `scripts/monitor.sh`: the root file system is less than 80 % used | 5 min | 10 min |
| `crashscouts-hourly` | `ExecStopPost=` of the hourly job | 1 hour | 30 min |
| `crashscouts-daily` | `ExecStopPost=` of the daily jobs | 1 day | 2 hours |
| `crashscouts-backup` | `ExecStopPost=` of the backup | 1 day | 2 hours |

- The job services report through systemd's `$SERVICE_RESULT` and `$EXIT_STATUS`, which are passed
  to `ExecStopPost=` ([systemd.exec](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html)).
  The scripts themselves stay unchanged.
- The ping key is one credential for all checks. It lives in `/etc/crashscouts/monitoring.env`
  (root, mode 600) and is never printed. Without that file nothing is sent.

### Error emails

- **Owner's decision 2026-11-17: yes, without personal data.**
- Django's own `AdminEmailHandler` sends cookies, headers, the client IP and POST data. It is
  removed from the `django` logger.
- Server errors go to `apps.core.error_mail.MinimalAdminEmailHandler`. It sends:
  - the URL pattern (`api/v1/projects/<slug>/`), not the path, which may contain a user name;
  - the exception class, not its message, which may contain user data;
  - the stack frames (file, line, function), no variables.
- At most 10 emails per day, so an error loop cannot use up the 300 free emails per month at
  Scaleway (OPERATIONS §12). The details are in the server logs.
- The recipient comes from `DJANGO_ERROR_MAIL_TO`; empty turns the emails off.
- Not covered: errors of the SSR server (Node). They are only in the logs; a failing page shows
  up in `crashscouts-site`.

### Logs

- **Retention (owner's decision 2026-11-17): 7 days**, the same as the backups.
- Docker's default log driver becomes `journald` (`/etc/docker/daemon.json`), so the container
  logs and the system logs (SSH) share one retention.
- `journald` keeps them persistently with:
  - `MaxRetentionSec=7day`;
  - `MaxFileSec=1day`. journald deletes whole files, and the default rotation of one month would
    keep entries far longer;
  - `SystemMaxUse=1G` as a size limit
  ([journald.conf](https://www.freedesktop.org/software/systemd/man/latest/journald.conf.html)).
- What the logs contain:
  - request lines with time, path, status and browser (Gunicorn, SSR server);
  - errors;
  - Caddy's and sshd's records, which can contain client IP addresses.
- The privacy policy says so (version 0.3 draft).

## Alternatives

| Option | Why not chosen |
|---|---|
| UptimeRobot (an external HTTP check) in addition | Also catches DNS or firewall faults that only visitors see, but adds a second provider and account. Its free plan was reported as non-commercial from December 2024 to May 2026 (secondary sources only; the official site was not reachable). Can be added later |
| Uptime Kuma or another self-hosted monitor on the same server | Fails together with the server |
| Sentry for errors | Sends request data to another processor; more than the beta needs |
| Docker's `json-file` driver with a size limit | Limits size, not age; the 7 days could not be guaranteed |

## Consequences

- **Accepted limitation:** the site check runs on the server itself, so a DNS or firewall fault
  that only outside visitors see goes unnoticed.
- Healthchecks.io knows the owner's email address and the times of the signals, nothing about the
  platform's users.
- After a change to `daemon.json`, the containers must be recreated; existing containers keep
  their old log driver (Docker documentation, "Configure logging drivers").
- Once the repository is public (WP 8.7), the free Business plan for open-source projects can be
  requested.

## Sources

- Healthchecks.io: [pricing](https://healthchecks.io/pricing/), [FAQ](https://healthchecks.io/docs/faq/),
  [privacy policy](https://healthchecks.io/privacy/), [pinging API](https://healthchecks.io/docs/http_api/),
  [signaling failures](https://healthchecks.io/docs/signaling_failures/); fetched 2026-11-17.
- systemd: `man/journald.conf.xml` and `man/systemd.exec.xml` in
  [systemd/systemd](https://github.com/systemd/systemd); fetched 2026-11-17.
- Docker: `content/manuals/engine/logging/drivers/journald.md` and `…/logging/configure.md` in
  [docker/docs](https://github.com/docker/docs); fetched 2026-11-17.
