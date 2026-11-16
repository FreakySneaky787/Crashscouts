# 0033 – Backups

- Status: Accepted
- Date: 2026-11-16

## Context

The platform runs on one Infomaniak VPS Lite since 2026-11-16 ([OPERATIONS.md](../OPERATIONS.md)).
VPS Lite has no snapshots, so the server has no copy of its data. SECURITY.md asks for automatic,
encrypted, off-site database backups with a **tested** restore before the beta. The privacy
policy left open how long deleted data may remain in backups (question Y).

## Decision

- **Storage (owner's decision 2026-11-16): Infomaniak Swiss Backup**, cloud backup.
  - The data stays in Switzerland.
  - The owner chose it over the recommended separate provider (Scaleway Object Storage). The
    trade-off is accepted: the server and its backups depend on the same provider account.
  - The owner's Infomaniak account therefore needs two-factor sign-in.
- **Retention (owner's decision 2026-11-16): 7 days.**
  - One snapshot per day for the last 7 days (`restic forget --keep-daily 7 --prune`).
  - Data deleted on the platform remains in backups for at most 7 more days, as stated in the
    privacy policy.
  - Retention 7 days was chosen over the recommended 30; a mistake noticed after a week cannot
    be undone from a backup.
- **Tool: restic 0.19.1**, official image `restic/restic` pinned by digest (released 2026-07-05,
  [restic](https://github.com/restic/restic)).
  - restic encrypts on the server before upload; the provider sees only encrypted data.
  - Infomaniak documents restic with its Swift protocol
    ([Getting Started Guide](https://www.infomaniak.com/en/support/faq/2543/getting-started-guide-swiss-backup-cloud-backup)).
    The script reads the backend from `/etc/crashscouts/backup.env`, so S3 would work too.
- **What is backed up:**
  - a `pg_dump` in custom format (one consistent transaction);
  - the `media` volume (uploaded files).
- **Not in the backup:**
  - `.env.prod` and the restic password; the owner keeps both in a password manager;
  - Caddy's certificates (renewed automatically) and the images (rebuilt from git).
- **Schedule:** `crashscouts-backup.timer` at 03:15 UTC, after the daily deletion jobs (02:30 UTC),
  so data purged that night is not copied again. `/var/lib/crashscouts/last-backup` records the
  last success for monitoring (WP 8.4).
- **Restore test:** `scripts/backup-restore-test.sh` restores the latest snapshot into a
  throwaway PostgreSQL container and a temporary folder on the server, then compares it with the
  live database: the number of tables, the main tables and the uploaded files. It then removes
  everything. It fails on a dump that does not restore, a missing table or an empty main table.

## Alternatives

| Option | Why not chosen |
|---|---|
| Scaleway Object Storage (France) | Recommended for provider separation and lowest cost; the owner preferred to keep data in Switzerland |
| Hetzner Storage Box (Germany/Finland) | Separate provider, but one more processor, and 1 TB is far more than needed |
| Snapshots of the server | Not offered for VPS Lite; not off-site either |

## Consequences

- **Accepted risk: someone with root on the server can also delete the backups**, because the
  storage credentials are on the server. Append-only or immutable storage would prevent this,
  but it adds complexity; revisit after the beta.
- The restic password and `.env.prod` must exist outside the server (the owner's password
  manager). Without the restic password the backups cannot be read.
- The emergency restore onto a new server is described in OPERATIONS.md §11.
