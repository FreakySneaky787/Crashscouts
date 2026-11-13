"""Creates the database cache table with the normal migrations (WP 3B.5, ADR 0022), so no
deployment step can forget it. ``createcachetable`` is idempotent."""

from django.core.management import call_command
from django.db import migrations


def create_cache_table(apps, schema_editor):
    call_command("createcachetable", database=schema_editor.connection.alias, verbosity=0)


class Migration(migrations.Migration):
    dependencies = []

    operations = [migrations.RunPython(create_cache_table, migrations.RunPython.noop)]
