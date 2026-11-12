# 0003 – Background jobs without Redis and Celery in the MVP

- Status: Accepted
- Date: 2026-11-12

## Context

The MVP needs few background jobs: sending emails and housekeeping such as deleting expired
invitations. The master prompt lists Redis and Celery "if needed". Since version 6.0, Django has
its own tasks framework. According to the docs, its bundled backends are meant for development
and testing only and provide no worker, so production needs a third-party backend.

## Decision

- Django's tasks framework with the ORM backend `django-tasks-db` (BSD-3-Clause; version 0.13.0
  on 2026-11-12). Jobs are stored in PostgreSQL.
- One worker process running the same code.
- **No Redis and no Celery in the MVP.**

## Alternatives

- **Celery with Redis:** mature, but two additional services. From version 8 on, Redis is
  tri-licensed (RSALv2, SSPLv1 or AGPLv3).
- **Celery with Valkey (BSD-3-Clause):** simpler licensing, but still an additional service.

## Consequences

- Less infrastructure and no licensing question.
- Slightly higher database load; considered uncritical at MVP volume, to be monitored.
- Switching to another tasks backend later (e.g. with Valkey) remains possible because the code
  only uses Django's tasks API.

## Sources

- [Django: tasks framework](https://docs.djangoproject.com/en/6.0/topics/tasks/)
- [Django: community ecosystem](https://www.djangoproject.com/community/ecosystem/)
- [PyPI: django-tasks-db](https://pypi.org/project/django-tasks-db/)
- [Redis licenses](https://redis.io/de/legal/licenses/)
