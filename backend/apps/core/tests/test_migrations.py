from io import StringIO

import pytest
from django.core.management import call_command


@pytest.mark.django_db
def test_no_missing_migrations():
    output = StringIO()
    try:
        call_command("makemigrations", "--check", "--dry-run", stdout=output, stderr=output)
    except SystemExit as exc:  # makemigrations --check beendet mit Code 1, wenn etwas fehlt
        pytest.fail(f"Fehlende Migrationen:\n{output.getvalue()} (exit {exc.code})")
