"""Two-factor authentication: TOTP, recovery codes, reauthentication rules (WP 1.3a)."""

import time

import pytest
from django.core import mail
from django.test import override_settings

from apps.accounts.adapter import MFAAdapter
from apps.audit.models import AuditEvent

from .conftest import BASE, csrf_client, post
from .totp import totp


def logged_in(user, password):
    client, _ = csrf_client()
    assert (
        post(client, "/auth/login", {"email": user.email, "password": password}).status_code == 200
    )
    return client


def enable_totp(client, password) -> str:
    secret = client.get(f"{BASE}/account/authenticators/totp").json()["meta"]["secret"]
    assert post(client, "/auth/reauthenticate", {"password": password}).status_code == 200
    response = post(client, "/account/authenticators/totp", {"code": totp(secret)})
    assert response.status_code == 200, response.content
    return secret


def flows(response) -> dict:
    return {flow["id"]: flow for flow in response.json().get("data", {}).get("flows", [])}


def test_enabling_totp_requires_a_fresh_password_confirmation(verified_user):
    user, password = verified_user
    client = logged_in(user, password)
    secret = client.get(f"{BASE}/account/authenticators/totp").json()["meta"]["secret"]

    response = post(client, "/account/authenticators/totp", {"code": totp(secret)})

    assert response.status_code == 401
    # Only password or a second factor may confirm: never a code sent by email.
    assert set(flows(response)) == {"reauthenticate"}
    assert client.get(f"{BASE}/account/authenticators").json()["data"] == []


def test_wrong_password_does_not_reauthenticate(verified_user):
    user, password = verified_user
    client = logged_in(user, password)
    assert post(client, "/auth/reauthenticate", {"password": "wrong-password"}).status_code == 400


def test_login_with_totp_needs_the_second_factor(verified_user):
    user, password = verified_user
    secret = enable_totp(logged_in(user, password), password)

    client, _ = csrf_client()
    login = post(client, "/auth/login", {"email": user.email, "password": password})

    assert login.status_code == 401
    pending = flows(login)["mfa_authenticate"]
    assert pending["is_pending"] is True
    assert set(pending["types"]) == {"totp", "recovery_codes"}
    # Password alone does not open a session.
    assert client.get(f"{BASE}/auth/session").json()["meta"]["is_authenticated"] is False

    wrong = post(client, "/auth/2fa/authenticate", {"code": "000000"})
    assert wrong.status_code == 400
    right = post(client, "/auth/2fa/authenticate", {"code": totp(secret)})
    assert right.status_code == 200, right.content
    assert client.get(f"{BASE}/auth/session").json()["meta"]["is_authenticated"] is True


def test_a_totp_code_cannot_be_used_twice(verified_user):
    user, password = verified_user
    secret = enable_totp(logged_in(user, password), password)
    code = totp(secret)

    first, _ = csrf_client()
    post(first, "/auth/login", {"email": user.email, "password": password})
    assert post(first, "/auth/2fa/authenticate", {"code": code}).status_code == 200

    second, _ = csrf_client()
    post(second, "/auth/login", {"email": user.email, "password": password})
    assert post(second, "/auth/2fa/authenticate", {"code": code}).status_code == 400


def test_old_totp_codes_are_rejected(verified_user):
    user, password = verified_user
    secret = enable_totp(logged_in(user, password), password)
    client, _ = csrf_client()
    post(client, "/auth/login", {"email": user.email, "password": password})

    stale = totp(secret, at=time.time() - 300)  # ten steps old; tolerance is one step

    assert post(client, "/auth/2fa/authenticate", {"code": stale}).status_code == 400


def test_recovery_codes_are_created_and_work_once(verified_user):
    user, password = verified_user
    owner = logged_in(user, password)
    enable_totp(owner, password)
    codes = owner.get(f"{BASE}/account/authenticators/recovery-codes").json()["data"][
        "unused_codes"
    ]
    assert len(codes) == 10

    client, _ = csrf_client()
    post(client, "/auth/login", {"email": user.email, "password": password})
    assert post(client, "/auth/2fa/authenticate", {"code": codes[0]}).status_code == 200

    again, _ = csrf_client()
    post(again, "/auth/login", {"email": user.email, "password": password})
    assert post(again, "/auth/2fa/authenticate", {"code": codes[0]}).status_code == 400


def test_disabling_totp_requires_reauthentication(verified_user):
    user, password = verified_user
    owner = logged_in(user, password)
    enable_totp(owner, password)
    codes = owner.get(f"{BASE}/account/authenticators/recovery-codes").json()["data"][
        "unused_codes"
    ]

    # A new, fully signed-in session (password + recovery code) without a fresh confirmation.
    client, _ = csrf_client()
    post(client, "/auth/login", {"email": user.email, "password": password})
    assert post(client, "/auth/2fa/authenticate", {"code": codes[0]}).status_code == 200
    assert client.get(f"{BASE}/auth/session").json()["meta"]["is_authenticated"] is True

    token = client.cookies["csrftoken"].value
    response = client.delete(f"{BASE}/account/authenticators/totp", HTTP_X_CSRFTOKEN=token)

    assert response.status_code == 401
    assert "reauthenticate" in flows(response)
    assert AuditEvent.objects.filter(kind=AuditEvent.Kind.MFA_REMOVED).count() == 0


def test_mfa_changes_are_audited_and_notified(verified_user, django_capture_on_commit_callbacks):
    user, password = verified_user
    with django_capture_on_commit_callbacks(execute=True):
        enable_totp(logged_in(user, password), password)
    client, _ = csrf_client()
    post(client, "/auth/login", {"email": user.email, "password": password})
    post(client, "/auth/2fa/authenticate", {"code": "000000"})

    added = set(
        AuditEvent.objects.filter(kind=AuditEvent.Kind.MFA_ADDED).values_list(
            "data__type", flat=True
        )
    )
    assert added == {"totp", "recovery_codes"}
    assert AuditEvent.objects.filter(kind=AuditEvent.Kind.MFA_FAILED, subject=user).exists()
    # The owner is told by email that a second factor was added (security notification).
    subjects = [message.subject for message in mail.outbox]
    assert any("Authenticator App Activated" in subject for subject in subjects), subjects


@pytest.mark.parametrize(
    ("frontend_url", "rp_id"),
    [
        ("https://testing.example.org", "testing.example.org"),
        ("http://localhost:3000", "localhost"),
    ],
)
def test_passkey_relying_party_is_the_public_frontend_host(rf, frontend_url, rp_id):
    with override_settings(FRONTEND_URL=frontend_url):
        assert MFAAdapter(rf.get("/")).get_public_key_credential_rp_entity()["id"] == rp_id
