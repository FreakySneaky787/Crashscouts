"""Rate limits per account and per IP address (WP 3B.5, gate item 3, ADR 0022)."""

import pytest
from django.core.cache import cache
from django.db import connection
from rest_framework.test import APIClient

from apps.accounts.tests.conftest import new_password
from apps.projects.tests.test_projects import make_user, new_project

CLIENT_IP = "203.0.113.57"
OTHER_IP = "198.51.100.23"


def client_from(ip: str, user=None, forwarded: str | None = None) -> APIClient:
    client = APIClient(REMOTE_ADDR=ip, **({"HTTP_X_FORWARDED_FOR": forwarded} if forwarded else {}))
    if user is not None:
        client.force_authenticate(user)
    return client


def report(client, project: str = "rl-app"):
    data = {"target_type": "project", "project": project, "reason": "spam"}
    return client.post("/api/v1/reports/", data, format="json")


@pytest.fixture
def projects(db):
    owner = make_user("rl-owner")
    return [new_project(owner, f"rl-app-{n}", "public") for n in range(70)]


def test_reports_are_limited_per_account(projects):
    user = make_user("rl-user")
    for project in projects[:20]:
        assert report(client_from(CLIENT_IP, user), project.slug).status_code == 201
    # A different address does not help one account.
    assert report(client_from(OTHER_IP, user), projects[20].slug).status_code == 429


def reports_until_refused(projects, prefix: str, remote: str, forwarded=None) -> int:
    """Report from five accounts (14 each, below the per-account limit of 20) until refused.

    70 attempts are possible, so a result of exactly 60 shows the per-address limit."""
    sent = 0
    for n in range(5):
        user = make_user(f"{prefix}-{n}")
        for project in projects[n * 14 : n * 14 + 14]:
            client = client_from(remote, user, forwarded=forwarded(sent) if forwarded else None)
            if report(client, project.slug).status_code == 429:
                return sent
            sent += 1
    return sent


def test_reports_are_limited_per_ip_across_accounts(projects):
    assert reports_until_refused(projects, "rl-ip", CLIENT_IP) == 60
    # Another address is not affected.
    assert report(client_from(OTHER_IP, make_user("rl-fresh")), projects[0].slug).status_code == 201


def test_proxy_trust_is_configured_once(settings):
    assert settings.TRUSTED_PROXY_COUNT == 0  # development and test default
    assert settings.ALLAUTH_TRUSTED_PROXY_COUNT == settings.TRUSTED_PROXY_COUNT
    assert settings.REST_FRAMEWORK["NUM_PROXIES"] == settings.TRUSTED_PROXY_COUNT


def test_forwarded_for_is_ignored_without_trusted_proxies(projects):
    # A forged, changing X-Forwarded-For must not create fresh limits.
    def forged(n: int) -> str:
        return f"192.0.2.{n % 250}"

    assert reports_until_refused(projects, "rl-spoof", CLIENT_IP, forwarded=forged) == 60


def test_forwarded_for_counts_behind_one_trusted_proxy(projects, settings):
    settings.REST_FRAMEWORK = {**settings.REST_FRAMEWORK, "NUM_PROXIES": 1}
    sent = reports_until_refused(projects, "rl-proxy", "10.0.0.2", forwarded=lambda n: CLIENT_IP)
    assert sent == 60
    # The proxy's own address is shared; another client behind it is not limited.
    other = client_from("10.0.0.2", make_user("rl-proxy-other"), forwarded=OTHER_IP)
    assert report(other, projects[69].slug).status_code == 201


def error_codes(response) -> list[str]:
    return [error.get("code") for error in response.json().get("errors", [])]


def test_failed_logins_are_limited_per_ip(db):
    user = make_user("rl-login")
    password = new_password()
    user.set_password(password)
    user.save()
    client = client_from(CLIENT_IP)
    codes = []
    for n in range(11):
        # Different accounts, so only the per-address limit (10 per minute) can apply.
        response = client.post(
            "/_allauth/browser/v1/auth/login",
            {"email": f"rl-nobody-{n}@example.test", "password": new_password()},
            format="json",
        )
        codes.append(error_codes(response))
    assert all(code == ["email_password_mismatch"] for code in codes[:10])
    # allauth answers a refused attempt with a form error, not with 429.
    assert codes[10] == ["too_many_login_attempts"]
    # The right password from another address still works.
    other = client_from(OTHER_IP).post(
        "/_allauth/browser/v1/auth/login",
        {"email": user.email, "password": password},
        format="json",
    )
    assert other.status_code == 200


def test_failed_logins_are_limited_per_account(db):
    user = make_user("rl-target")
    codes = []
    for n in range(6):
        ip = f"198.51.100.{n + 1}"  # a fresh address for every attempt
        response = client_from(ip).post(
            "/_allauth/browser/v1/auth/login",
            {"email": user.email, "password": new_password()},
            format="json",
        )
        codes.append(error_codes(response))
    assert codes[4] == ["email_password_mismatch"]
    assert codes[5] == ["too_many_login_attempts"]  # 5 per account and 5 minutes


def test_signup_is_limited_per_ip(db, settings):
    settings.SIGNUP_ENABLED = True
    statuses = []
    for n in range(22):
        response = client_from(CLIENT_IP).post(
            "/_allauth/browser/v1/auth/signup",
            {
                "email": f"rl-signup-{n}@example.test",
                "username": f"rl-signup-{n}",
                "password": new_password(),
                "age_confirmed": True,
            },
            format="json",
        )
        statuses.append(response.status_code)
    assert statuses[-1] == 429  # 20 signups per minute and address


def test_password_reset_is_limited_per_ip(db):
    statuses = [
        client_from(CLIENT_IP)
        .post(
            "/_allauth/browser/v1/auth/password/request",
            {"email": f"rl-reset-{n}@example.test"},
            format="json",
        )
        .status_code
        for n in range(22)
    ]
    assert statuses[-1] == 429  # 20 requests per minute and address


def test_the_cache_holds_no_plain_ip_or_key(projects):
    report(client_from(CLIENT_IP, make_user("rl-cache")), projects[0].slug)
    client_from(CLIENT_IP).post(
        "/_allauth/browser/v1/auth/login",
        {"email": "rl-nobody@example.test", "password": new_password()},
        format="json",
    )
    with connection.cursor() as cursor:
        cursor.execute("SELECT cache_key FROM rate_limit_cache")
        keys = [row[0] for row in cursor.fetchall()]
    assert keys  # the limits were recorded
    assert not any(CLIENT_IP in key or "throttle" in key or "allauth" in key for key in keys)
    assert cache.get("missing") is None


GATE_VIEWS = [
    ("apps.moderation.views", "ReportCreateView", "report"),
    ("apps.campaigns.views", "CampaignListView", "campaign_create"),
    ("apps.campaigns.invitation_views", "CampaignInvitationsView", "campaign_invite"),
    ("apps.projects.views", "ProjectCreateView", "project_create"),
    ("apps.projects.team_views", "InvitationCreateView", "project_invite"),
    ("apps.profiles.views", "OwnAvatarView", "avatar_upload"),
    ("apps.projects.image_views", "ProjectLogoView", "project_image"),
    ("apps.projects.image_views", "ScreenshotCreateView", "project_image"),
]


@pytest.mark.parametrize(("module", "name", "scope"), GATE_VIEWS)
def test_gate_actions_are_limited_per_account_and_per_ip(module, name, scope):
    """Every action of gate item 3 carries both limits with a configured rate."""
    from importlib import import_module

    from rest_framework.settings import api_settings
    from rest_framework.test import APIRequestFactory
    from rest_framework.throttling import ScopedRateThrottle

    from apps.core.throttling import IPScopedRateThrottle

    view = getattr(import_module(module), name)()
    view.request = APIRequestFactory().post("/")
    assert view.throttle_scope == scope
    kinds = {type(throttle) for throttle in view.get_throttles()}
    assert kinds == {ScopedRateThrottle, IPScopedRateThrottle}
    rates = api_settings.DEFAULT_THROTTLE_RATES
    assert rates[scope]
    assert rates[f"{scope}_ip"]


def test_purge_removes_only_expired_entries(db):
    from io import StringIO

    from django.core.management import call_command

    cache.set("rl-expired", [1], timeout=60)
    cache.set("rl-current", [1], timeout=60)
    with connection.cursor() as cursor:
        cursor.execute(
            "UPDATE rate_limit_cache SET expires = now() - interval '1 second' "
            "WHERE cache_key = %s",
            [cache.make_key("rl-expired")],
        )
    out = StringIO()
    call_command("purge_rate_limit_cache", stdout=out)
    assert "Deleted 1 expired" in out.getvalue()
    with connection.cursor() as cursor:
        cursor.execute("SELECT count(*) FROM rate_limit_cache")
        assert cursor.fetchone()[0] == 1
    assert cache.get("rl-current") == [1]
