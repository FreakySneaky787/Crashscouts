import pytest
from django.db import DatabaseError
from django.urls import reverse

HEALTH_URL = "/api/v1/health/"


def test_health_url_is_stable():
    assert reverse("health") == HEALTH_URL


@pytest.mark.django_db
def test_health_ok_with_database(api_client):
    response = api_client.get(HEALTH_URL)

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "checks": {"database": "ok"}}


@pytest.mark.django_db
def test_health_requires_no_authentication(api_client):
    response = api_client.get(HEALTH_URL)

    assert response.status_code == 200
    assert "sessionid" not in response.cookies


@pytest.mark.django_db
def test_health_is_not_cacheable(api_client):
    response = api_client.get(HEALTH_URL)

    assert response["Cache-Control"] == "no-store"


def test_health_reports_database_failure_without_leaking_details(api_client, monkeypatch):
    class BrokenConnection:
        def cursor(self):
            raise DatabaseError("secret-internal-detail host=db.internal password=hunter2")

    monkeypatch.setattr("apps.core.views.connection", BrokenConnection())

    response = api_client.get(HEALTH_URL)

    assert response.status_code == 503
    assert response.json() == {"status": "error", "checks": {"database": "error"}}
    assert b"secret-internal-detail" not in response.content
    assert b"hunter2" not in response.content


@pytest.mark.django_db
def test_health_rejects_write_methods(api_client):
    response = api_client.post(HEALTH_URL, {}, format="json")

    assert response.status_code == 405
