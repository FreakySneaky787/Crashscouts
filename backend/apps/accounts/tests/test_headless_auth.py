"""Minimale allauth-Headless-Prüfung für den SSR-Durchstich (AP 0.4).

Registrierung ist bis Phase 1 bewusst deaktiviert.
"""

import secrets

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

# Generated per test run: no fixed credentials in the repository.
PASSWORD = secrets.token_urlsafe(16)
BASE = "/_allauth/browser/v1"


@pytest.fixture
def user(db):
    return get_user_model().objects.create_user(username="headless-user", password=PASSWORD)


def csrf_client() -> tuple[APIClient, str]:
    """Client mit erzwungener CSRF-Prüfung; holt das Token wie ein Browser über ein GET."""
    client = APIClient(enforce_csrf_checks=True)
    client.get(f"{BASE}/config")
    token = client.cookies["csrftoken"].value
    return client, token


@pytest.mark.django_db
def test_session_is_unauthenticated_by_default():
    response = APIClient().get(f"{BASE}/auth/session")
    assert response.status_code == 401


def test_login_without_csrf_token_is_rejected(user):
    client = APIClient(enforce_csrf_checks=True)
    response = client.post(
        f"{BASE}/auth/login", {"username": user.username, "password": PASSWORD}, format="json"
    )
    assert response.status_code == 403
    assert "sessionid" not in response.cookies


def test_login_with_csrf_sets_session_and_logout_clears_it(user):
    client, token = csrf_client()

    login = client.post(
        f"{BASE}/auth/login",
        {"username": user.username, "password": PASSWORD},
        format="json",
        HTTP_X_CSRFTOKEN=token,
    )
    assert login.status_code == 200, login.content
    assert login.cookies["sessionid"].value
    assert login.cookies["sessionid"]["httponly"]

    session = client.get(f"{BASE}/auth/session")
    assert session.status_code == 200
    assert session.json()["data"]["user"]["username"] == user.username

    token = client.cookies["csrftoken"].value  # Token rotiert beim Login
    logout = client.delete(f"{BASE}/auth/session", HTTP_X_CSRFTOKEN=token)
    assert logout.status_code == 401  # allauth: nach Logout ist man nicht mehr authentifiziert
    assert client.get(f"{BASE}/auth/session").status_code == 401


def test_wrong_password_does_not_create_session(user):
    client, token = csrf_client()
    response = client.post(
        f"{BASE}/auth/login",
        {"username": user.username, "password": "wrong-password"},
        format="json",
        HTTP_X_CSRFTOKEN=token,
    )
    assert response.status_code == 400
    assert "sessionid" not in response.cookies


@pytest.mark.django_db
def test_signup_is_disabled_until_phase_1():
    client, token = csrf_client()
    response = client.post(
        f"{BASE}/auth/signup",
        {"username": "newbie", "password": secrets.token_urlsafe(16)},
        format="json",
        HTTP_X_CSRFTOKEN=token,
    )
    assert response.status_code in {403, 404}
    assert not get_user_model().objects.filter(username="newbie").exists()


@pytest.mark.django_db
def test_only_browser_client_is_exposed():
    response = APIClient().get("/_allauth/app/v1/config")
    assert response.status_code == 404
