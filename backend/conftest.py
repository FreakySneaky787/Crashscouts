import pytest
from django.core.cache import cache
from rest_framework.test import APIClient


@pytest.fixture(autouse=True)
def _isolated_rate_limits():
    """allauth keeps rate-limit counters in the cache; every test starts from zero."""
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


# Shared account fixtures (also used by the audit tests).
from apps.accounts.tests.conftest import verified_user  # noqa: E402, F401
