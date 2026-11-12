import secrets
import uuid

import pytest
from django.contrib.auth import get_user_model
from django.middleware.csrf import _get_new_csrf_string, _mask_cipher_secret
from rest_framework.test import APIClient

from apps.ssr_probe.models import ProbeItem

# Generated per test run: no fixed credentials in the repository.
PASSWORD = secrets.token_urlsafe(16)


@pytest.fixture
def owner(db):
    return get_user_model().objects.create_user(username="owner", password=PASSWORD)


@pytest.fixture
def stranger(db):
    return get_user_model().objects.create_user(username="stranger", password=PASSWORD)


@pytest.fixture
def public_item(owner):
    return ProbeItem.objects.create(title="Public", is_public=True, owner=owner)


@pytest.fixture
def private_item(owner):
    return ProbeItem.objects.create(title="Private", is_public=False, owner=owner)


def detail(item_id) -> str:
    return f"/api/v1/probe/items/{item_id}/"


def touch(item_id) -> str:
    return f"/api/v1/probe/items/{item_id}/touch/"


# --- Lesen -----------------------------------------------------------------------------------


def test_anonymous_sees_public_item(api_client, public_item):
    response = api_client.get(detail(public_item.pk))
    assert response.status_code == 200
    assert response.json()["title"] == "Public"


def test_anonymous_gets_404_for_private_item(api_client, private_item):
    response = api_client.get(detail(private_item.pk))
    assert response.status_code == 404
    assert b"Private" not in response.content


def test_stranger_gets_404_for_private_item(api_client, stranger, private_item):
    api_client.force_login(stranger)
    response = api_client.get(detail(private_item.pk))
    assert response.status_code == 404


def test_owner_sees_private_item(api_client, owner, private_item):
    api_client.force_login(owner)
    response = api_client.get(detail(private_item.pk))
    assert response.status_code == 200
    assert response.json()["title"] == "Private"


def test_unknown_item_is_indistinguishable_from_private(api_client, private_item):
    hidden = api_client.get(detail(private_item.pk))
    missing = api_client.get(detail(uuid.uuid4()))
    assert hidden.status_code == missing.status_code == 404
    assert hidden.json() == missing.json()


# --- Schreiben -------------------------------------------------------------------------------


def test_anonymous_cannot_touch(api_client, public_item):
    response = api_client.post(touch(public_item.pk))
    assert response.status_code == 403
    public_item.refresh_from_db()
    assert public_item.touch_count == 0


def test_stranger_cannot_touch_private_item(api_client, stranger, private_item):
    api_client.force_login(stranger)
    response = api_client.post(touch(private_item.pk))
    assert response.status_code == 404
    private_item.refresh_from_db()
    assert private_item.touch_count == 0


def test_owner_touch_without_csrf_token_is_rejected(owner, private_item):
    client = APIClient(enforce_csrf_checks=True)
    client.force_login(owner)
    response = client.post(touch(private_item.pk))
    assert response.status_code == 403
    assert "CSRF" in response.json()["detail"]
    private_item.refresh_from_db()
    assert private_item.touch_count == 0


def test_owner_touch_with_csrf_token_succeeds(owner, private_item):
    client = APIClient(enforce_csrf_checks=True)
    client.force_login(owner)
    secret = _get_new_csrf_string()
    client.cookies["csrftoken"] = secret
    response = client.post(touch(private_item.pk), HTTP_X_CSRFTOKEN=_mask_cipher_secret(secret))
    assert response.status_code == 200
    assert response.json()["touch_count"] == 1
