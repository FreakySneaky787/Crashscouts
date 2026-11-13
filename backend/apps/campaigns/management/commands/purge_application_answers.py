"""Deletes application answers 30 days after their campaign ended. Run daily (like
purge_deleted_accounts)."""

from django.core.management.base import BaseCommand

from apps.campaigns.applications import purge_answers


class Command(BaseCommand):
    help = "Delete application answers of campaigns completed or cancelled more than 30 days ago."

    def handle(self, *args, **options):
        count = purge_answers()
        self.stdout.write(f"Deleted application answers: {count}")
