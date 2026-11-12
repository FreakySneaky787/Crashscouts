"""Account deletion with a 14-day grace period and personal data export (WP 1.5)."""

import json
from datetime import timedelta

import pytest
from allauth.account.models import EmailAddress
from django.contrib.auth import get_user_model
from django.core import mail
from django.core.files.storage import default_storage
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.lifecycle import GRACE_PERIOD, purge_due_accounts
from apps.audit.models import AuditEvent
from apps.profiles.avatars import avatar_path, store_avatar

from .conftest import BASE, csrf_client, new_password, post
from .test_mfa import enable_totp

User = get_user_model()


def logged_in(user, password):
    client, _ = csrf_client()
    assert (
        post(client, "/auth/login", {"email": user.email, "password": password}).status_code == 200
    )
    return client


def api_post(client, path: str, data: dict):
    token = client.cookies["csrftoken"].value
    return client.post(path, data, format="json", HTTP_X_CSRFTOKEN=token)


def subjects() -> list[str]:
    return [message.subject for message in mail.outbox]


# --- Deletion -------------------------------------------------------------------------------


@pytest.mark.django_db
def test_deletion_requires_a_login():
    client, _ = csrf_client()
    response = api_post(client, "/api/v1/me/deletion/", {"password": "x", "confirm": True})
    assert response.status_code == 403


def test_deletion_requires_the_password_and_the_confirmation(verified_user):
    user, password = verified_user
    client = logged_in(user, password)

    wrong = api_post(
        client, "/api/v1/me/deletion/", {"password": "wrong-password", "confirm": True}
    )
    unconfirmed = api_post(client, "/api/v1/me/deletion/", {"password": password, "confirm": False})

    assert wrong.status_code == 400
    assert wrong.json() == {"password": ["wrong_password"]}
    assert unconfirmed.status_code == 400
    assert unconfirmed.json() == {"confirm": ["required"]}
    user.refresh_from_db()
    assert user.deletion_scheduled_for is None


def test_accounts_without_a_password_must_set_one_first(verified_user):
    # E.g. accounts created with GitHub: no password to confirm with.
    user, password = verified_user
    user.set_unusable_password()
    user.save()
    client = APIClient()
    client.force_authenticate(user)

    response = client.post(
        "/api/v1/me/deletion/", {"password": password, "confirm": True}, format="json"
    )

    assert response.status_code == 400
    assert response.json() == {"password": ["no_password"]}
    user.refresh_from_db()
    assert user.deletion_scheduled_for is None


def test_deletion_hides_the_account_and_signs_out_everywhere(verified_user):
    user, password = verified_user
    first = logged_in(user, password)
    second = logged_in(user, password)  # another device

    response = api_post(first, "/api/v1/me/deletion/", {"password": password, "confirm": True})

    assert response.status_code == 202, response.content
    user.refresh_from_db()
    remaining = user.deletion_scheduled_for - timezone.now()
    assert GRACE_PERIOD - timedelta(minutes=1) < remaining <= GRACE_PERIOD
    for client in (first, second):
        assert client.get(f"{BASE}/auth/session").status_code == 401
    assert first.get(f"/api/v1/profiles/{user.username}/").status_code == 404
    assert "Your account will be deleted" in " ".join(subjects())
    assert AuditEvent.objects.filter(kind=AuditEvent.Kind.DELETION_REQUESTED, subject=user).exists()


def test_signing_in_during_the_grace_period_cancels_the_deletion(verified_user):
    user, password = verified_user
    api_post(
        logged_in(user, password), "/api/v1/me/deletion/", {"password": password, "confirm": True}
    )

    client = logged_in(user, password)

    user.refresh_from_db()
    assert user.deletion_scheduled_for is None
    assert client.get(f"/api/v1/profiles/{user.username}/").status_code == 200
    assert "Your account deletion was cancelled" in " ".join(subjects())
    assert AuditEvent.objects.filter(kind=AuditEvent.Kind.DELETION_CANCELLED, subject=user).exists()


def test_deletion_is_rate_limited(verified_user):
    user, password = verified_user
    client = logged_in(user, password)
    statuses = [
        api_post(
            client, "/api/v1/me/deletion/", {"password": "wrong-password", "confirm": True}
        ).status_code
        for _ in range(11)
    ]
    assert statuses[:10] == [400] * 10
    assert statuses[10] == 429


# --- Final deletion -------------------------------------------------------------------------


def test_purge_deletes_only_accounts_whose_grace_period_has_ended(verified_user):
    user, password = verified_user
    api_post(
        logged_in(user, password), "/api/v1/me/deletion/", {"password": password, "confirm": True}
    )
    key = store_avatar(b"RIFF....WEBP")
    user.profile.avatar_key = key
    user.profile.save()
    other = User.objects.create_user(
        username="still-waiting", email="waiting@example.test", password=new_password()
    )
    other.deletion_scheduled_for = timezone.now() + timedelta(days=30)
    other.save()
    user_pk = user.pk

    assert purge_due_accounts(now=timezone.now()) == 0  # nobody is due yet
    assert purge_due_accounts(now=timezone.now() + GRACE_PERIOD + timedelta(minutes=1)) == 1

    assert not User.objects.filter(pk=user_pk).exists()
    assert not EmailAddress.objects.filter(email=user.email).exists()
    assert not default_storage.exists(avatar_path(key))
    assert User.objects.filter(username="still-waiting").exists()
    assert "Your account was deleted" in " ".join(subjects())
    # The log keeps the events, but without any reference to the person.
    assert (
        AuditEvent.objects.filter(kind=AuditEvent.Kind.ACCOUNT_DELETED, subject=None).count() == 1
    )
    assert not AuditEvent.objects.filter(subject_id=user_pk).exists()


def test_purge_command_runs(db, capsys):
    call_command("purge_deleted_accounts")
    assert "Deleted accounts: 0" in capsys.readouterr().out


# --- Export -------------------------------------------------------------------------------


@pytest.mark.django_db
def test_export_requires_a_login():
    client, _ = csrf_client()
    assert api_post(client, "/api/v1/me/export/", {"password": "x"}).status_code == 403


def test_export_requires_the_password(verified_user):
    user, password = verified_user
    client = logged_in(user, password)
    assert api_post(client, "/api/v1/me/export/", {"password": "wrong-password"}).status_code == 400


def test_export_contains_own_data_but_no_secrets(verified_user, django_capture_on_commit_callbacks):
    user, password = verified_user
    client = logged_in(user, password)
    with django_capture_on_commit_callbacks(execute=True):
        secret = enable_totp(client, password)
    codes = client.get(f"{BASE}/account/authenticators/recovery-codes").json()["data"][
        "unused_codes"
    ]
    client.patch(
        "/api/v1/me/profile/",
        {"bio": "Testing on old laptops."},
        format="json",
        HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value,
    )
    stranger = User.objects.create_user(
        username="stranger", email="stranger@example.test", password=new_password()
    )

    response = api_post(client, "/api/v1/me/export/", {"password": password})

    assert response.status_code == 200, response.content
    assert response["Content-Disposition"].startswith("attachment;")
    assert response["Cache-Control"] == "private, no-store"
    body = response.content.decode()
    data = json.loads(body)
    assert data["account"]["username"] == user.username
    assert data["account"]["email"] == user.email
    assert data["profile"]["bio"] == "Testing on old laptops."
    assert {m["type"] for m in data["two_factor_methods"]} == {"totp", "recovery_codes"}
    assert any(e["event"] == "mfa.added" for e in data["security_log"])
    # No secrets and nothing about other people.
    for forbidden in [secret, *codes, user.password, password, stranger.email, stranger.username]:
        assert forbidden not in body
    assert AuditEvent.objects.filter(kind=AuditEvent.Kind.DATA_EXPORTED, subject=user).exists()
