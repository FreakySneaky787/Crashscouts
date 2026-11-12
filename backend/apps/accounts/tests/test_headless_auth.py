"""Login, logout and session through the allauth headless browser API (login by email only)."""

import pytest
from allauth.account.models import EmailAddress
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from .conftest import BASE, csrf_client, new_password, post


@pytest.mark.django_db
def test_session_is_unauthenticated_by_default():
    assert APIClient().get(f"{BASE}/auth/session").status_code == 401


def test_login_without_csrf_token_is_rejected(verified_user):
    user, password = verified_user
    client = APIClient(enforce_csrf_checks=True)
    response = client.post(
        f"{BASE}/auth/login", {"email": user.email, "password": password}, format="json"
    )
    assert response.status_code == 403
    assert "sessionid" not in response.cookies


def test_login_by_email_sets_session_and_logout_clears_it(verified_user):
    user, password = verified_user
    client, _ = csrf_client()

    login = post(client, "/auth/login", {"email": user.email, "password": password})
    assert login.status_code == 200, login.content
    assert login.cookies["sessionid"]["httponly"]
    assert client.get(f"{BASE}/auth/session").json()["data"]["user"]["username"] == user.username

    token = client.cookies["csrftoken"].value
    logout = client.delete(f"{BASE}/auth/session", HTTP_X_CSRFTOKEN=token)
    assert logout.status_code == 401  # allauth: after logout the session is unauthenticated
    assert client.get(f"{BASE}/auth/session").status_code == 401


def test_email_login_ignores_letter_case(verified_user):
    user, password = verified_user
    client, _ = csrf_client()
    response = post(client, "/auth/login", {"email": user.email.upper(), "password": password})
    assert response.status_code == 200, response.content


def test_login_by_username_is_not_possible(verified_user):
    user, password = verified_user
    client, _ = csrf_client()
    response = post(client, "/auth/login", {"username": user.username, "password": password})
    assert response.status_code == 400
    assert "sessionid" not in response.cookies


def test_wrong_password_does_not_create_session(verified_user):
    user, _ = verified_user
    client, _ = csrf_client()
    response = post(client, "/auth/login", {"email": user.email, "password": "wrong-password"})
    assert response.status_code == 400
    assert "sessionid" not in response.cookies


@pytest.mark.django_db
def test_unverified_account_cannot_log_in():
    password = new_password()
    user = get_user_model().objects.create_user(
        username="unverified", email="unverified@example.test", password=password
    )
    EmailAddress.objects.create(user=user, email=user.email, verified=False, primary=True)
    client, _ = csrf_client()

    response = post(client, "/auth/login", {"email": user.email, "password": password})

    assert response.status_code == 401
    flows = {flow["id"]: flow for flow in response.json()["data"]["flows"]}
    assert flows["verify_email"]["is_pending"] is True
    assert client.get(f"{BASE}/auth/session").json()["meta"]["is_authenticated"] is False


@pytest.mark.django_db
def test_only_browser_client_is_exposed():
    assert APIClient().get("/_allauth/app/v1/config").status_code == 404
