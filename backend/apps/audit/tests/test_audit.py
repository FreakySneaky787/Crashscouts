"""Audit log: events are recorded without personal data and cannot be changed or deleted."""

import json

import pytest
from django.contrib.auth import get_user_model
from django.core import mail

from apps.accounts.tests.conftest import csrf_client, link_key, new_password, post
from apps.audit.models import AuditEvent, AuditLogImmutableError
from apps.audit.services import record

Kind = AuditEvent.Kind


def kinds() -> list[str]:
    return list(AuditEvent.objects.order_by("created_at").values_list("kind", flat=True))


@pytest.mark.django_db
def test_signup_confirmation_login_and_logout_are_recorded():
    client, _ = csrf_client()
    password = new_password()
    post(
        client,
        "/auth/signup",
        {
            "email": "audit@example.test",
            "username": "audited",
            "password": password,
            "age_confirmed": True,
        },
    )
    key = link_key(mail.outbox[0].body, "verify-email")
    post(client, "/auth/email/verify", {"key": key})
    post(client, "/auth/login", {"email": "audit@example.test", "password": password})
    token = client.cookies["csrftoken"].value
    client.delete("/_allauth/browser/v1/auth/session", HTTP_X_CSRFTOKEN=token)

    assert kinds() == [Kind.SIGNUP, Kind.EMAIL_CONFIRMED, Kind.LOGIN, Kind.LOGOUT]
    user = get_user_model().objects.get(username="audited")
    assert set(AuditEvent.objects.values_list("subject", flat=True)) == {user.pk}


def test_failed_login_is_recorded_without_the_typed_identifier(verified_user):
    user, _ = verified_user
    client, _ = csrf_client()
    post(client, "/auth/login", {"email": user.email, "password": "wrong-password"})
    post(client, "/auth/login", {"email": "stranger@example.test", "password": "wrong-password"})

    failed = list(AuditEvent.objects.filter(kind=Kind.LOGIN_FAILED).order_by("created_at"))
    assert [event.subject_id for event in failed] == [user.pk, None]
    stored = json.dumps([event.data for event in AuditEvent.objects.all()])
    assert "example.test" not in stored
    assert "wrong-password" not in stored


def test_password_reset_is_recorded(verified_user):
    user, _ = verified_user
    client, _ = csrf_client()
    post(client, "/auth/password/request", {"email": user.email})
    key = link_key(mail.outbox[0].body, "password/reset")
    post(client, "/auth/password/reset", {"key": key, "password": new_password()})

    assert AuditEvent.objects.filter(kind=Kind.PASSWORD_RESET, subject=user).count() == 1


def test_entries_cannot_be_changed_or_deleted(verified_user):
    user, _ = verified_user
    event = record(Kind.LOGIN, actor=user, subject=user)

    event.kind = Kind.LOGOUT
    with pytest.raises(AuditLogImmutableError):
        event.save()
    with pytest.raises(AuditLogImmutableError):
        event.delete()
    with pytest.raises(AuditLogImmutableError):
        AuditEvent.objects.filter(pk=event.pk).update(kind=Kind.LOGOUT)
    with pytest.raises(AuditLogImmutableError):
        AuditEvent.objects.all().delete()
    assert AuditEvent.objects.get(pk=event.pk).kind == Kind.LOGIN


def test_events_outlive_deleted_accounts(verified_user):
    user, _ = verified_user
    event = record(Kind.LOGIN, actor=user, subject=user)

    user.delete()

    event.refresh_from_db()
    assert event.actor_id is None
    assert event.subject_id is None
