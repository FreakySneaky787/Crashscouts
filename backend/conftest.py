import pytest
from django.core.cache import cache
from rest_framework.test import APIClient


def _uses_database(request) -> bool:
    names = set(request.fixturenames)
    return bool(
        request.node.get_closest_marker("django_db")
        or names & {"db", "transactional_db", "django_db_reset_sequences"}
    )


@pytest.fixture(autouse=True)
def _isolated_rate_limits(request):
    """Rate-limit counters live in the database cache (ADR 0022); every test that may touch
    them starts from zero. Tests without database access cannot use the cache at all."""
    if not _uses_database(request):
        yield
        return
    # Autouse fixtures run before the test's own fixtures: enable database access first.
    names = request.fixturenames
    request.getfixturevalue("transactional_db" if "transactional_db" in names else "db")
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


# Shared account fixtures (also used by the audit tests).
from apps.accounts.tests.conftest import verified_user  # noqa: E402, F401
