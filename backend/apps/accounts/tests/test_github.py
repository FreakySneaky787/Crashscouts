"""GitHub login (WP 1.4) with a simulated GitHub: no network, no real credentials.

Decisions: a GitHub login never logs into an existing account because of a matching email; new
accounts go through the signup form (username, 16+ confirmation); linking only from a signed-in
session ("connect").
"""

import json
from urllib.parse import parse_qs, urlsplit

import pytest
import requests
from allauth.socialaccount.models import SocialAccount
from django.contrib.auth import get_user_model

from .conftest import BASE, csrf_client, new_password, post

FRONTEND_HOST = "localhost:3000"


class FakeResponse:
    def __init__(self, payload, status: int = 200) -> None:
        self.status_code = status
        self._payload = payload
        self.headers = {"content-type": "application/json"}
        self.text = json.dumps(payload)
        self.content = self.text.encode()

    def json(self):
        return self._payload

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise requests.HTTPError(self.status_code)


class FakeGitHub:
    """Stands in for allauth's requests session: token exchange, /user and /user/emails."""

    def __init__(self, uid: int, login: str, emails: list[dict]) -> None:
        self.profile = {
            "id": uid,
            "login": login,
            "name": login.title(),
            "email": None,
            "bio": "Likes testing",
            "location": "Somewhere",
            "avatar_url": "https://avatars.example.test/u/1",
        }
        self.emails = emails

    def __enter__(self):
        return self

    def __exit__(self, *exc) -> bool:
        return False

    def request(self, method, url, **kwargs):
        assert url == "https://github.com/login/oauth/access_token"
        return FakeResponse({"access_token": "simulated-access-token", "token_type": "bearer"})

    def get(self, url, headers=None):
        if url == "https://api.github.com/user":
            return FakeResponse(self.profile)
        if url == "https://api.github.com/user/emails":
            return FakeResponse(self.emails)
        raise AssertionError(f"unexpected request to {url}")


@pytest.fixture
def github(db, settings, monkeypatch):
    """Configures a GitHub app with generated dummy credentials and a simulated GitHub."""
    settings.SOCIALACCOUNT_PROVIDERS = {
        "github": {
            "APPS": [{"client_id": "dummy-client-id", "secret": new_password(), "key": ""}],
            "SCOPE": ["read:user", "user:email"],
        }
    }
    state = {"fake": FakeGitHub(4242, "octo-tester", [])}
    monkeypatch.setattr(
        "allauth.socialaccount.adapter.DefaultSocialAccountAdapter.get_requests_session",
        lambda self: state["fake"],
    )
    return state


def start(client, process: str = "login"):
    """Starts the GitHub flow like the frontend does (form POST, public host forwarded)."""
    token = client.cookies["csrftoken"].value
    response = client.post(
        f"{BASE}/auth/provider/redirect",
        {"provider": "github", "callback_url": "/login/provider/callback", "process": process},
        HTTP_X_CSRFTOKEN=token,
        HTTP_X_FORWARDED_HOST=FRONTEND_HOST,
    )
    assert response.status_code == 302, response.content
    return urlsplit(response["Location"])


def finish(client, location):
    """GitHub sends the browser back to the callback URL with code and state."""
    state = parse_qs(location.query)["state"][0]
    callback = urlsplit(parse_qs(location.query)["redirect_uri"][0]).path
    return client.get(
        callback, {"code": "simulated-code", "state": state}, HTTP_X_FORWARDED_HOST=FRONTEND_HOST
    )


def flows(response) -> dict:
    return {f["id"]: f for f in response.json().get("data", {}).get("flows", [])}


@pytest.mark.django_db
def test_without_credentials_github_is_not_offered():
    client, _ = csrf_client()
    providers = client.get(f"{BASE}/config").json()["data"].get("socialaccount", {})
    assert providers.get("providers", []) == []


def test_login_starts_at_github_with_the_public_callback_url(github):
    client, _ = csrf_client()
    location = start(client)

    assert location.scheme == "https"
    assert location.netloc == "github.com"
    assert location.path == "/login/oauth/authorize"
    query = parse_qs(location.query)
    assert query["client_id"] == ["dummy-client-id"]
    # The callback uses the public frontend host, not the internal backend host.
    assert query["redirect_uri"] == [f"http://{FRONTEND_HOST}/accounts/github/login/callback/"]
    assert set(query["scope"][0].split()) == {"read:user", "user:email"}


def test_callback_with_a_forged_state_is_rejected(github):
    client, _ = csrf_client()
    start(client)
    response = client.get(
        "/accounts/github/login/callback/",
        {"code": "simulated-code", "state": "forged"},
        HTTP_X_FORWARDED_HOST=FRONTEND_HOST,
    )
    assert response.status_code == 302
    assert "error" in response["Location"]
    assert client.get(f"{BASE}/auth/session").status_code == 401


def test_new_github_user_must_complete_signup_with_age_confirmation(github):
    github["fake"] = FakeGitHub(
        1001, "Octo-Tester", [{"email": "octo@example.test", "primary": True, "verified": True}]
    )
    client, _ = csrf_client()
    finish(client, start(client))

    session = client.get(f"{BASE}/auth/session")
    assert session.status_code == 401
    assert flows(session)["provider_signup"]["is_pending"] is True
    assert not get_user_model().objects.filter(email="octo@example.test").exists()

    missing_age = post(client, "/auth/provider/signup", {"username": "octo-tester"})
    assert missing_age.status_code == 400
    assert "age_confirmed" in {e.get("param") for e in missing_age.json()["errors"]}

    # The form shows the email address GitHub reported (prefilled by the frontend).
    pending = client.get(f"{BASE}/auth/provider/signup").json()["data"]
    assert pending["email"][0]["email"] == "octo@example.test"
    done = post(
        client,
        "/auth/provider/signup",
        {"username": "octo-tester", "email": "octo@example.test", "age_confirmed": True},
    )
    assert done.status_code == 200, done.content
    user = get_user_model().objects.get(username="octo-tester")
    assert user.email == "octo@example.test"
    assert user.age_confirmed_at is not None
    assert user.socialaccount_set.get().uid == "1001"


def test_matching_email_never_logs_into_the_existing_account(github, verified_user):
    user, _ = verified_user
    github["fake"] = FakeGitHub(
        2002, "intruder", [{"email": user.email, "primary": True, "verified": True}]
    )
    client, _ = csrf_client()
    finish(client, start(client))

    session = client.get(f"{BASE}/auth/session")
    assert session.status_code == 401  # not logged in as the existing user
    attempt = post(client, "/auth/provider/signup", {"username": "intruder", "age_confirmed": True})
    assert attempt.status_code != 200
    assert not SocialAccount.objects.filter(user=user).exists()
    assert client.get(f"{BASE}/auth/session").status_code == 401


def test_signed_in_user_can_connect_and_then_log_in_with_github(github, verified_user):
    user, password = verified_user
    github["fake"] = FakeGitHub(
        3003, "verified-gh", [{"email": "other@example.test", "primary": True, "verified": True}]
    )
    client, _ = csrf_client()
    post(client, "/auth/login", {"email": user.email, "password": password})
    finish(client, start(client, process="connect"))

    account = SocialAccount.objects.get(user=user)
    assert account.uid == "3003"
    # Data minimisation (question Z): only account number, username and profile link are kept.
    assert account.extra_data == {"id": 3003, "login": "verified-gh"}

    fresh, _ = csrf_client()
    finish(fresh, start(fresh))
    session = fresh.get(f"{BASE}/auth/session")
    assert session.status_code == 200
    assert session.json()["data"]["user"]["username"] == user.username


def test_connect_without_a_signed_in_user_links_nothing(github):
    github["fake"] = FakeGitHub(
        5005, "anon", [{"email": "anon@example.test", "primary": True, "verified": True}]
    )
    client, _ = csrf_client()
    result = finish(client, start(client, process="connect"))

    assert result.status_code == 302
    assert "error=permission_denied" in result["Location"]
    assert not SocialAccount.objects.exists()
    assert client.get(f"{BASE}/auth/session").json()["meta"]["is_authenticated"] is False


def test_foreign_callback_urls_are_refused(github):
    client, _ = csrf_client()
    token = client.cookies["csrftoken"].value
    response = client.post(
        f"{BASE}/auth/provider/redirect",
        {"provider": "github", "callback_url": "https://evil.example/", "process": "login"},
        HTTP_X_CSRFTOKEN=token,
    )
    assert "github.com" not in response.get("Location", "")


def test_existing_github_profiles_are_trimmed_by_the_migration(db):
    from importlib import import_module

    from django.apps import apps as global_apps

    user = get_user_model().objects.create_user(username="trim-me", email="trim@example.test")
    account = SocialAccount(user=user, provider="github", uid="77")
    SocialAccount.objects.bulk_create([account])  # bypasses the signal, like old rows
    SocialAccount.objects.filter(pk=account.pk).update(
        extra_data={"id": 77, "login": "old", "html_url": "https://github.com/old", "bio": "x"}
    )
    migration = import_module("apps.accounts.migrations.0005_trim_github_profile_data")
    migration.trim(global_apps, None)
    assert SocialAccount.objects.get(pk=account.pk).extra_data == {
        "id": 77,
        "login": "old",
        "html_url": "https://github.com/old",
    }
