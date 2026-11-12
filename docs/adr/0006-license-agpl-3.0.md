# 0006 – License AGPL-3.0

- Status: Accepted; **re-check critically before going public** (requirement from the master
  prompt)
- Date: 2026-11-12

## Context

The platform is to be open source. The master prompt names AGPL-3.0 as the preferred license.
The platform will be operated as a network service.

## Decision

- AGPL-3.0 (SPDX identifier `AGPL-3.0-only`). The choice between `-only` and `-or-later` will be
  confirmed before the repository goes public.
- The full text in `LICENSE` comes from GitHub's license template (choosealicense.com) and was
  checked against the SPDX license list. The only difference is `https` instead of `http` in three
  Free Software Foundation URLs.

## Rationale

- The network clause (section 13) obliges anyone who runs a modified version as a service to
  offer its source code. This protects the open-source character for hosted copies too.

## Alternatives

- **GPL-3.0:** no network clause; hosted modifications would not have to be disclosed.
- **MIT or Apache-2.0:** very open, but allow closed, hosted modifications.

## Consequences

- The hosted platform must link to its source code (footer).
- All dependencies must be AGPL-compatible. Checked so far: Django, DRF, Celery (BSD-3-Clause),
  django-allauth (MIT), psycopg (LGPL-3.0-only), django-tasks-db (BSD-3-Clause), React, React
  Router, i18next, react-i18next (MIT).
- Some companies avoid AGPL software. This may reduce corporate contributions; accepted
  deliberately.
- The contribution model (DCO or CLA) is still open (open question G).

## Sources

- [choosealicense.com: AGPL-3.0](https://choosealicense.com/licenses/agpl-3.0/)
- [SPDX License List: AGPL-3.0-only](https://spdx.org/licenses/AGPL-3.0-only.html)
- PyPI and npm metadata of the packages listed, queried on 2026-11-12.
