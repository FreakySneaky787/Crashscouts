"""Deletes expired rate-limit entries from the database cache (ADR 0022).

Django's database cache removes expired rows only when the table outgrows MAX_ENTRIES. The
entries hold hashed IP addresses, which the owner allowed for at most one day (2026-11-13), so
this command runs hourly and deletes every expired row.
"""

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import connection
from django.utils import timezone


class Command(BaseCommand):
    help = "Deletes expired entries from the rate-limit cache table."

    def handle(self, *args, **options):
        table = connection.ops.quote_name(settings.CACHES["default"]["LOCATION"])
        with connection.cursor() as cursor:
            cursor.execute(f"DELETE FROM {table} WHERE expires < %s", [timezone.now()])  # noqa: S608
            deleted = cursor.rowcount
        self.stdout.write(f"Deleted {deleted} expired cache entries.")
