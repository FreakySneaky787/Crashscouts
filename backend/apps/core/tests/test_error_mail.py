"""Error emails carry no personal data and are limited per day (WP 8.4, ADR 0034)."""

import logging
import secrets
import sys

import pytest
from django.core import mail
from django.test import Client
from django.utils.log import AdminEmailHandler

from apps.core.error_mail import build_report

pytestmark = [pytest.mark.django_db, pytest.mark.urls("apps.core.tests.error_urls")]


@pytest.fixture
def admins(settings):
    settings.ADMINS = [f"owner-{secrets.token_hex(4)}@example.org"]
    settings.ERROR_MAIL_DAILY_LIMIT = 3
    return settings.ADMINS


def _fail(client: Client, username: str, email: str, session: str = "x"):
    client.cookies["sessionid"] = session
    return client.post(
        f"/u/{username}/fail/",
        {"email": email},
        HTTP_USER_AGENT="agent-" + secrets.token_hex(4),
        REMOTE_ADDR="203.0.113.7",
    )


def test_a_server_error_sends_one_mail_without_personal_data(admins):
    client = Client(raise_request_exception=False)
    username = "user-" + secrets.token_hex(4)
    email = f"{secrets.token_hex(4)}@example.org"
    session = secrets.token_hex(16)

    response = _fail(client, username, email, session)

    assert response.status_code == 500
    assert len(mail.outbox) == 1
    message = mail.outbox[0]
    assert message.to == admins
    text = message.subject + message.body
    assert "RuntimeError" in message.subject
    assert "u/<str:username>/fail/" in text
    assert "failing_view" in message.body  # the stack frames
    # Nothing the request or the exception message carried.
    for secret in (username, email, session, "203.0.113.7", "agent-"):
        assert secret not in text
    assert "duplicate key" not in text


def test_error_mails_stop_at_the_daily_limit(admins):
    client = Client(raise_request_exception=False)
    for _ in range(5):
        _fail(client, "someone", "a@example.org")

    assert len(mail.outbox) == 3


def test_no_mail_without_recipients(settings):
    settings.ADMINS = []
    _fail(Client(raise_request_exception=False), "someone", "a@example.org")

    assert mail.outbox == []


def test_successful_requests_send_no_mail(admins):
    assert Client().get("/ok/").status_code == 200
    assert mail.outbox == []


def test_djangos_full_report_handler_is_not_attached():
    # Django's AdminEmailHandler would send cookies, headers, the IP and POST data.
    for name in ("django", "django.request", "django.security", ""):
        handlers = logging.getLogger(name).handlers
        assert not any(isinstance(h, AdminEmailHandler) for h in handlers), name


def test_a_failing_mail_server_does_not_break_the_error_response(admins, monkeypatch):
    def broken(*args, **kwargs):
        raise ConnectionRefusedError("mail server down")

    monkeypatch.setattr("apps.core.error_mail.mail_admins", broken)
    monkeypatch.setattr(logging, "raiseExceptions", False)  # as in production

    response = _fail(Client(raise_request_exception=False), "someone", "a@example.org")

    assert response.status_code == 500


def test_an_error_outside_a_request_is_reported_without_a_gap():
    # Seen on the server on 2026-11-17: "Route:    (no request)" had a double space.
    try:
        1 / 0  # noqa: B018
    except ZeroDivisionError:
        info = sys.exc_info()
    record = logging.LogRecord("django.request", logging.ERROR, "", 0, "x", None, info)

    subject, body = build_report(record)

    assert subject == "ZeroDivisionError at (no request)"
    assert "Route:   (no request)\n" in body
