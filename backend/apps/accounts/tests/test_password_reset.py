"""Password reset by email link; never reveals whether an address has an account."""

import pytest
from django.core import mail

from .conftest import BASE, csrf_client, link_key, new_password, post


def test_reset_link_sets_a_new_password(verified_user):
    user, old_password = verified_user
    client, _ = csrf_client()

    request = post(client, "/auth/password/request", {"email": user.email})
    assert request.status_code == 200, request.content
    assert len(mail.outbox) == 1
    key = link_key(mail.outbox[0].body, "password/reset")

    fresh, _ = csrf_client()
    info = fresh.get(f"{BASE}/auth/password/reset", HTTP_X_PASSWORD_RESET_KEY=key)
    assert info.status_code == 200, info.content
    new = new_password()
    reset = post(fresh, "/auth/password/reset", {"key": key, "password": new})
    assert reset.status_code in {200, 401}, reset.content

    user.refresh_from_db()
    assert user.check_password(new)
    assert not user.check_password(old_password)
    # The key is single-use.
    again = post(fresh, "/auth/password/reset", {"key": key, "password": new_password()})
    assert again.status_code == 400


@pytest.mark.django_db
def test_reset_request_for_unknown_address_looks_the_same_and_sends_nothing():
    client, _ = csrf_client()
    response = post(client, "/auth/password/request", {"email": "nobody@example.test"})
    assert response.status_code == 200, response.content
    assert mail.outbox == []


def test_reset_rejects_weak_password(verified_user):
    user, old_password = verified_user
    client, _ = csrf_client()
    post(client, "/auth/password/request", {"email": user.email})
    key = link_key(mail.outbox[0].body, "password/reset")

    response = post(client, "/auth/password/reset", {"key": key, "password": "short-pass1"})

    assert response.status_code == 400
    user.refresh_from_db()
    assert user.check_password(old_password)


@pytest.mark.django_db
def test_invalid_reset_key_is_rejected():
    client, _ = csrf_client()
    response = client.get(f"{BASE}/auth/password/reset", HTTP_X_PASSWORD_RESET_KEY="bogus-key")
    assert response.status_code == 400
