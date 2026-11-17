"""Limits on emails anyone can trigger (owner's decision 2026-11-17, security check): at most 5
sign-ups per hour and IP, and a platform-wide daily ceiling for account emails."""

import secrets

import pytest
from allauth.account.adapter import get_adapter
from django.core import mail

from .conftest import csrf_client, new_password, post


def _signup(client, n: int):
    tag = secrets.token_hex(4)
    return post(
        client,
        "/auth/signup",
        {
            "email": f"flood-{tag}-{n}@example.test",
            "username": f"flood-{tag}-{n}",
            "password": new_password(),
            "age_confirmed": True,
        },
    )


@pytest.mark.django_db
def test_a_sixth_signup_from_one_address_within_an_hour_is_refused():
    client, _ = csrf_client()
    statuses = [_signup(client, n).status_code for n in range(6)]

    assert 429 not in statuses[:5], statuses
    assert statuses[5] == 429
    assert len(mail.outbox) == 5


@pytest.mark.django_db
def test_account_emails_stop_at_the_daily_ceiling(settings):
    settings.ACCOUNT_EMAIL_DAILY_LIMIT = 2
    settings.ADMINS = ["owner@example.test"]
    adapter = get_adapter()

    for _ in range(4):
        adapter.send_mail(
            "account/email/deletion_cancelled", "someone@example.test", {"username": "someone"}
        )

    to_someone = [m for m in mail.outbox if m.to == ["someone@example.test"]]
    to_owner = [m for m in mail.outbox if m.to == ["owner@example.test"]]
    assert len(to_someone) == 2
    assert len(to_owner) == 1  # one warning, not one per dropped email
    assert "someone@example.test" not in to_owner[0].body


@pytest.mark.django_db
def test_platform_notifications_do_not_count_against_the_ceiling(settings):
    settings.ACCOUNT_EMAIL_DAILY_LIMIT = 0
    adapter = get_adapter()
    adapter.send_mail(
        "account/email/deletion_cancelled", "someone@example.test", {"username": "someone"}
    )
    assert mail.outbox == []

    # Notifications need a confirmed account and have their own per-account and per-IP limits.
    adapter.send_mail(
        "projects/email/ownership_received",
        "someone@example.test",
        {
            "username": "someone",
            "project_name": "Demo",
            "project_url": "https://example.test/p/demo",
        },
    )
    assert len(mail.outbox) == 1
