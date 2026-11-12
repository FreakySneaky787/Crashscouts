"""Updates the licence table from apps/catalog/data/spdx-licenses.json (after replacing that file
with a newer SPDX release)."""

from django.core.management.base import BaseCommand

from apps.catalog.models import License
from apps.catalog.spdx import sync


class Command(BaseCommand):
    help = "Insert or update SPDX licences from the bundled data file."

    def handle(self, *args, **options):
        self.stdout.write(f"Licences synchronised: {sync(License)}")
