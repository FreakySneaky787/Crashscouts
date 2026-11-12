# 0003 – Hintergrundjobs ohne Redis und Celery im MVP

- Status: Akzeptiert
- Datum: 2026-11-12

## Kontext

Das MVP braucht wenige Hintergrundjobs: E-Mails versenden und aufräumen, zum Beispiel abgelaufene Einladungen löschen. Der Master-Prompt nennt Redis und Celery „bei Bedarf". Seit Version 6.0 hat Django ein eigenes Tasks-Framework. Die mitgelieferten Backends sind laut Doku aber nur für Entwicklung und Tests gedacht und haben keinen Worker. Für den Produktivbetrieb braucht es ein Drittanbieter-Backend.

## Entscheidung

- Djangos Tasks-Framework mit dem ORM-Backend `django-tasks-db` (BSD-3-Clause; Version 0.13.0 am 2026-11-12). Die Jobs liegen in PostgreSQL.
- Ein Worker-Prozess läuft mit demselben Code.
- **Kein Redis und kein Celery im MVP.**

## Alternativen

- **Celery mit Redis:** ausgereift, aber zwei zusätzliche Dienste. Redis ist ab Version 8 dreifach lizenziert (RSALv2, SSPLv1 oder AGPLv3).
- **Celery mit Valkey (BSD-3-Clause):** lizenzrechtlich einfacher, aber ebenfalls ein zusätzlicher Dienst.

## Konsequenzen

- Weniger Infrastruktur und keine Lizenzfrage.
- Die Last auf der Datenbank steigt leicht; für das MVP-Volumen wird das als unkritisch eingeschätzt und muss beobachtet werden.
- Ein späterer Wechsel auf ein anderes Tasks-Backend (z. B. mit Valkey) ist möglich, weil der Code nur die Django-Tasks-API nutzt.

## Quellen

- [Django: Tasks-Framework](https://docs.djangoproject.com/en/6.0/topics/tasks/)
- [Django: Community-Ökosystem](https://www.djangoproject.com/community/ecosystem/)
- [PyPI: django-tasks-db](https://pypi.org/project/django-tasks-db/)
- [Redis-Lizenzen](https://redis.io/de/legal/licenses/)
