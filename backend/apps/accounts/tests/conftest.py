import re
import secrets
from urllib.parse import unquote

import pytest
from allauth.account.models import EmailAddress
from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

BASE = "/_allauth/browser/v1"


def new_password() -> str:
    """Generated per call: no fixed credentials in the repository."""
    return secrets.token_urlsafe(18)


def csrf_client() -> tuple[APIClient, str]:
    """Client with enforced CSRF checks; obtains the token via a GET, like a browser."""
    client = APIClient(enforce_csrf_checks=True)
    client.get(f"{BASE}/config")
    return client, client.cookies["csrftoken"].value


def post(client: APIClient, path: str, data: dict):
    token = client.cookies["csrftoken"].value  # rotates on login
    return client.post(f"{BASE}{path}", data, format="json", HTTP_X_CSRFTOKEN=token)


def link_key(body: str, route: str) -> str:
    """Extracts the key from a frontend link such as <FRONTEND_URL>/verify-email/<key>."""
    match = re.search(re.escape(f"{settings.FRONTEND_URL}/{route}/") + r"([^\s/]+)", body)
    assert match, f"no {route} link in email:\n{body}"
    return unquote(match.group(1))


@pytest.fixture
def verified_user(db):
    """An account with a confirmed email address and its generated password."""
    password = new_password()
    user = get_user_model().objects.create_user(
        username="verified-user", email="verified@example.test", password=password
    )
    EmailAddress.objects.create(user=user, email=user.email, verified=True, primary=True)
    return user, password
