"""Deletes accounts whose deletion grace period has ended. Run daily (e.g. a systemd timer)."""

from django.core.management.base import BaseCommand

from apps.accounts.lifecycle import purge_due_accounts


class Command(BaseCommand):
    help = "Delete accounts whose 14-day deletion grace period has ended."

    def handle(self, *args, **options):
        count = purge_due_accounts()
        self.stdout.write(f"Deleted accounts: {count}")
