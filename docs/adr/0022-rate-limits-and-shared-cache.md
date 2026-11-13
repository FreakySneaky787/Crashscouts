# 0022 – Rate limits and the shared cache

- Status: Accepted
- Date: 2026-11-13

## Context

Gate item 3 of phase 3B: rate limiting per user and per IP address for login, signup, password
reset, reports, campaign creation, invitations and uploads, tested. The project owner decided
(2026-11-13): the shared cache is Django's database cache (open question O, no extra service,
ADR 0003); IP addresses are stored **only as a hash and for at most one day**.

Findings before this work package:

1. allauth and Django REST Framework put the **raw IP address** into their cache keys.
2. The SSR server did not pass the client address on: Django saw only the SSR server's address, so
   all visitors of the SSR pages shared one per-IP limit.
3. DRF reads `X-Forwarded-For` without any check when `NUM_PROXIES` is unset, so a client could
   pick its own address.
4. The default cache counts per process; with several workers the limits did not hold.

## Decision

1. **Database cache** for all environments: `DatabaseCache` in the table `rate_limit_cache`,
   created by the migration `core/0001_cache_table` (no deployment step can forget it).
2. **Hashed keys:** the cache `KEY_FUNCTION` (`config/cache.py`) replaces every key by
   `HMAC-SHA256(SECRET_KEY, key)`. No key, and so no IP address or email address, is stored in
   plain text. The values are lists of timestamps only.
3. **At most one day:** entries expire with their window (DRF: up to one day after the last request
   from that address; allauth: minutes). Django deletes expired rows only when the table outgrows
   `MAX_ENTRIES`, so `manage.py purge_rate_limit_cache` runs **hourly** and deletes them.
4. **Client address:** one setting, `DJANGO_TRUSTED_PROXY_COUNT`, sets both
   `ALLAUTH_TRUSTED_PROXY_COUNT` and DRF's `NUM_PROXIES` (both take the entry
   `X-Forwarded-For[-count]`; checked in the installed sources). Development and tests: 0, the
   header is ignored. Production: required and at least 1; the reverse proxy **overwrites**
   `X-Forwarded-For` with the client address. The SSR server passes the header on unchanged, so
   both paths (proxy → Django and proxy → SSR → Django) have exactly one trusted proxy.
5. **Two limits per gate action:** the existing per-account limit plus a per-IP limit
   (`IPScopedRateThrottle`, scope `<scope>_ip`). The per-IP limit is higher, because several people
   can share one address (office, mobile network). Provisional values:

   | Action | Per account | Per IP |
   |---|---|---|
   | Reports | 20/day | 60/day |
   | Campaign creation | 20/day | 40/day |
   | Project creation | 10/day | 30/day |
   | Project invitations | 30/day | 60/day |
   | Campaign invitations | 50/day | 100/day |
   | Avatar upload | 10/hour | 30/hour |
   | Logo and screenshots | 30/hour | 60/hour |

   Login, signup and reset keep allauth's defaults (login 30/min per IP; failed logins 10/min per
   IP and 5 per 5 minutes per account; signup 20/min per IP; reset 20/min per IP and 5/min per
   address), now effective across processes. allauth refuses further failed logins with the form
   error `too_many_login_attempts` (status 400), not with 429.

## Alternatives

- **Valkey/Redis:** faster, but one more service to run and secure; not needed at the expected
  scale (ADR 0003).
- **Plain IP addresses in the cache:** rejected by the owner.
- **Truncated IP addresses (e.g. /24):** coarser limits for everyone behind the same network;
  hashing keeps the precision without storing the address.

## Consequences

- An HMAC with the secret key is **pseudonymisation, not anonymisation**: whoever holds both the
  database and `DJANGO_SECRET_KEY` could recover IPv4 addresses by trying all of them. The one-day
  limit and the hourly cleanup keep this window small.
- Rotating `DJANGO_SECRET_KEY` resets all counters (harmless).
- Every limited request writes to PostgreSQL; fine for the MVP, to be measured before the beta.
- A wrong `DJANGO_TRUSTED_PROXY_COUNT` either lets clients forge their address (too high) or
  makes everyone share the proxy's address (too low); production refuses to start without it.

## Sources

The behaviour was verified in the installed package sources (pinned in `backend/uv.lock`); the
documentation websites were not reachable from the development environment on 2026-11-13, so the
links below were not re-checked that day.

- Django 6.1.3: `django/core/cache/backends/db.py` (expired rows are deleted only in `_cull`, which
  runs when the table exceeds `MAX_ENTRIES`), `KEY_FUNCTION` in `django/core/cache/backends/base.py`.
  Documentation: <https://docs.djangoproject.com/en/6.1/topics/cache/>.
- Django REST Framework 3.18.3: `rest_framework/throttling.py` (`get_ident`, `NUM_PROXIES`).
  Documentation: <https://www.django-rest-framework.org/api-guide/throttling/>.
- django-allauth 65.22: `allauth/core/internal/httpkit.py` (`get_client_ip_from_xff`),
  `allauth/account/app_settings.py` (default rates), `allauth/account/adapter.py`
  (`too_many_login_attempts`). Documentation: <https://docs.allauth.org/en/latest/account/rate_limits.html>.
