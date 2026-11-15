"""Signup with mandatory email verification (decisions D/L/M, docs/OPEN-QUESTIONS.md)."""

import secrets
import string

import pytest
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core import mail
from django.db import IntegrityError, transaction
from django.test import override_settings

from .conftest import BASE, csrf_client, link_key, new_password, post

User = get_user_model()


def signup_data(**overrides) -> dict:
    return {
        "email": "new.tester@example.test",
        "username": "new-tester",
        "password": new_password(),
        "age_confirmed": True,
        **overrides,
    }


def field_errors(response) -> set[str]:
    return {error.get("param") for error in response.json().get("errors", [])}


@pytest.mark.django_db
def test_signup_creates_unverified_account_and_sends_frontend_link():
    client, _ = csrf_client()
    data = signup_data()

    response = post(client, "/auth/signup", data)

    assert response.status_code == 401, response.content  # pending: verify_email
    flows = {flow["id"]: flow for flow in response.json()["data"]["flows"]}
    assert flows["verify_email"]["is_pending"] is True
    user = User.objects.get(username="new-tester")
    assert user.email == "new.tester@example.test"
    assert user.age_confirmed_at is not None
    assert user.check_password(data["password"])
    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == ["new.tester@example.test"]
    assert link_key(mail.outbox[0].body, "verify-email")
    body = mail.outbox[0].body
    assert data["password"] not in body
    # Emails name the platform and the public frontend, never the internal backend host.
    assert settings.PLATFORM_NAME in body
    assert "testserver" not in body


@pytest.mark.django_db
def test_confirming_the_email_allows_login():
    client, _ = csrf_client()
    data = signup_data()
    post(client, "/auth/signup", data)
    key = link_key(mail.outbox[0].body, "verify-email")

    fresh, _ = csrf_client()  # the link is usually opened in another browser session
    info = fresh.get(f"{BASE}/auth/email/verify", HTTP_X_EMAIL_VERIFICATION_KEY=key)
    assert info.status_code == 200, info.content
    confirm = post(fresh, "/auth/email/verify", {"key": key})
    assert confirm.status_code in {200, 401}, confirm.content

    login = post(fresh, "/auth/login", {"email": data["email"], "password": data["password"]})
    assert login.status_code == 200, login.content


@pytest.mark.django_db
def test_invalid_verification_key_is_rejected():
    client, _ = csrf_client()
    response = post(client, "/auth/email/verify", {"key": "not-a-real-key"})
    assert response.status_code == 400


@pytest.mark.django_db
def test_signup_requires_age_confirmation():
    client, _ = csrf_client()
    for value in (False, None):
        data = signup_data(age_confirmed=value)
        response = post(client, "/auth/signup", data)
        assert response.status_code == 400, response.content
        assert "age_confirmed" in field_errors(response)
    assert not User.objects.filter(username="new-tester").exists()
    assert mail.outbox == []


@pytest.mark.django_db
@pytest.mark.parametrize(
    "password",
    [
        "short-pass1",  # 11 characters: below the minimum of 12
        "password1234",  # common password
        "123456789012",  # numeric only
        "x" * 257,  # above the upper bound
    ],
)
def test_signup_rejects_weak_or_oversized_passwords(password):
    client, _ = csrf_client()
    response = post(client, "/auth/signup", signup_data(password=password))
    assert response.status_code == 400, response.content
    assert "password" in field_errors(response)
    assert not User.objects.filter(username="new-tester").exists()


@pytest.mark.django_db
def test_twelve_character_password_without_character_classes_is_accepted():
    client, _ = csrf_client()
    # Exactly 12 characters, lowercase letters and one space only: no composition rules apply.
    letters = "".join(secrets.choice(string.ascii_lowercase) for _ in range(11))
    password = f"{letters[:5]} {letters[5:]}"
    assert len(password) == 12
    response = post(client, "/auth/signup", signup_data(password=password))
    assert response.status_code == 401, response.content


@pytest.mark.django_db
def test_duplicate_email_in_other_case_does_not_reveal_or_create_account(verified_user):
    user, _ = verified_user
    client, _ = csrf_client()

    response = post(
        client, "/auth/signup", signup_data(email=user.email.upper(), username="someone-else")
    )

    # Same answer as a successful signup: whether the address is registered stays secret.
    assert response.status_code == 401, response.content
    assert not User.objects.filter(username="someone-else").exists()
    assert User.objects.filter(email__iexact=user.email).count() == 1
    # The real owner is told by email instead.
    assert len(mail.outbox) == 1
    assert mail.outbox[0].to[0].lower() == user.email


@pytest.mark.django_db
@pytest.mark.parametrize("username", ["Verified-User", "verified-user"])
def test_username_is_unique_ignoring_case(verified_user, username):
    client, _ = csrf_client()
    response = post(client, "/auth/signup", signup_data(username=username))
    assert response.status_code == 400, response.content
    assert "username" in field_errors(response)


@pytest.mark.django_db
@pytest.mark.parametrize(
    "username",
    ["ab", "-starts-with-hyphen", "has space", "ümlaut", "a" * 31, "admin", "crashscouts"],
)
def test_invalid_or_reserved_usernames_are_rejected(username):
    client, _ = csrf_client()
    response = post(client, "/auth/signup", signup_data(username=username))
    assert response.status_code == 400, response.content
    assert "username" in field_errors(response)


@pytest.mark.django_db
def test_username_is_stored_lowercase():
    client, _ = csrf_client()
    post(client, "/auth/signup", signup_data(username="New-Tester"))
    assert User.objects.filter(username="new-tester").exists()


@pytest.mark.django_db
@override_settings(SIGNUP_ENABLED=False)
def test_signup_can_be_closed():
    client, _ = csrf_client()
    response = post(client, "/auth/signup", signup_data())
    assert response.status_code == 403, response.content
    assert not User.objects.filter(username="new-tester").exists()
    assert mail.outbox == []


@pytest.mark.django_db
def test_database_enforces_case_insensitive_unique_email_and_username():
    User.objects.create_user(username="first", email="Same@Example.test")
    with pytest.raises(IntegrityError), transaction.atomic():
        User.objects.create_user(username="second", email="same@example.test")
    with pytest.raises(IntegrityError), transaction.atomic():
        User.objects.create_user(username="FIRST", email="other@example.test")


@pytest.mark.django_db
def test_signup_is_rate_limited_per_ip():
    client, _ = csrf_client()
    statuses = [
        post(client, "/auth/signup", signup_data(username="x" * 2)).status_code  # invalid, cheap
        for _ in range(21)
    ]
    assert statuses[:20] == [400] * 20
    assert statuses[20] == 429
