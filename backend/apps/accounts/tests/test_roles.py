"""Platform roles (WP 3B.1): admin and moderator, only with 2FA; the last admin is protected."""

from io import StringIO

import pytest
from allauth.mfa.models import Authenticator
from django.core.management import call_command
from django.core.management.base import CommandError

from apps.accounts.lifecycle import request_deletion
from apps.accounts.roles import effective_role, is_admin, is_moderator
from apps.audit.models import AuditEvent
from apps.projects.tests.test_projects import client_for, make_user

from .conftest import new_password

URL = "/api/v1/platform/roles/"


def with_2fa(user):
    Authenticator.objects.create(user=user, type=Authenticator.Type.TOTP, data={"secret": "x"})
    return user


def make_admin(username: str):
    user = with_2fa(make_user(username))
    password = new_password()
    user.set_password(password)
    user.platform_role = "admin"
    user.save()
    return user, password


@pytest.fixture
def admin(db):
    return make_admin("role-admin")


def change(user, password: str, username: str, role: str):
    return client_for(user).post(
        URL, {"username": username, "role": role, "password": password}, format="json"
    )


def test_roles_need_two_factor_authentication(db):
    user = make_user("role-no2fa")
    user.platform_role = "admin"
    user.save()
    assert effective_role(user) == ""
    assert not is_admin(user)
    with_2fa(user)
    assert is_admin(user)
    assert is_moderator(user)  # admins moderate as well
    request_deletion(user)
    user.refresh_from_db()
    assert not is_admin(user)  # no role during the deletion grace period


def test_only_admins_see_and_use_the_roles_page(admin):
    user, _ = admin
    moderator = with_2fa(make_user("role-mod"))
    moderator.platform_role = "moderator"
    moderator.save()
    plain = make_user("role-plain")
    unprotected = make_user("role-admin-no2fa")
    unprotected.platform_role = "admin"
    unprotected.save()
    listing = client_for(user).get(URL).json()
    assert {(e["username"], e["role"], e["two_factor"]) for e in listing} >= {
        ("role-admin", "admin", True),
        ("role-mod", "moderator", True),
        ("role-admin-no2fa", "admin", False),
    }
    for other in (moderator, plain, unprotected):
        client = client_for(other)
        assert client.get(URL).status_code == 404
        assert client.post(URL, {"username": "role-plain", "role": "admin"}).status_code == 404
    assert client_for().get(URL).status_code in {401, 403}


def test_admins_grant_and_revoke_roles_with_their_password(admin):
    user, password = admin
    target = with_2fa(make_user("role-target"))
    assert change(user, password, "role-target", "moderator").status_code == 204
    target.refresh_from_db()
    assert target.platform_role == "moderator"
    event = AuditEvent.objects.get(kind=AuditEvent.Kind.PLATFORM_ROLE_CHANGED)
    assert (event.actor, event.subject) == (user, target)
    assert event.data == {"from": "none", "to": "moderator", "via": "admin_page"}
    assert change(user, password, "role-target", "none").status_code == 204
    target.refresh_from_db()
    assert target.platform_role == ""
    assert client_for(target).get("/api/v1/me/platform-role/").json() == {"platform_role": "none"}


def test_wrong_password_changes_nothing(admin):
    user, _ = admin
    with_2fa(make_user("role-victim"))
    response = change(user, "not-the-password", "role-victim", "admin")
    assert response.json() == {"code": "wrong_password"}
    assert not AuditEvent.objects.filter(kind=AuditEvent.Kind.PLATFORM_ROLE_CHANGED).exists()


@pytest.mark.parametrize(
    ("setup", "code"),
    [
        ("no_2fa", "target_needs_2fa"),
        ("unconfirmed", "user_not_found"),
        ("deleting", "user_not_found"),
        ("missing", "user_not_found"),
    ],
)
def test_who_cannot_get_a_role(admin, setup, code):
    user, password = admin
    if setup == "no_2fa":
        make_user("role-candidate")
    elif setup == "unconfirmed":
        with_2fa(make_user("role-candidate", verified=False))
    elif setup == "deleting":
        request_deletion(with_2fa(make_user("role-candidate")))
    assert change(user, password, "role-candidate", "moderator").json() == {"code": code}


def test_the_last_admin_cannot_be_removed(admin):
    user, password = admin
    assert change(user, password, "role-admin", "moderator").json() == {"code": "last_admin"}
    assert change(user, password, "role-admin", "none").json() == {"code": "last_admin"}
    second, _ = make_admin("role-second")
    assert change(user, password, "role-admin", "none").status_code == 204  # now possible
    user.refresh_from_db()
    assert user.platform_role == ""
    assert second.platform_role == "admin"


def test_role_changes_are_rate_limited(admin):
    user, password = admin
    for _ in range(10):
        change(user, "wrong", "role-admin", "admin")
    assert change(user, password, "role-admin", "admin").status_code == 429


def test_the_server_command_creates_the_first_admin(db):
    user = with_2fa(make_user("role-first"))
    out = StringIO()
    call_command("set_platform_role", "role-first", "admin", stdout=out)
    assert "role-first: none -> admin" in out.getvalue()
    user.refresh_from_db()
    assert is_admin(user)
    event = AuditEvent.objects.get(kind=AuditEvent.Kind.PLATFORM_ROLE_CHANGED)
    assert event.actor is None
    assert event.data["via"] == "command"
    with pytest.raises(CommandError, match="last_admin"):
        call_command("set_platform_role", "role-first", "none", stdout=out)
    with pytest.raises(CommandError, match="user_not_found"):
        call_command("set_platform_role", "nobody-here", "admin", stdout=out)
    make_user("role-plain-cmd")
    with pytest.raises(CommandError, match="target_needs_2fa"):
        call_command("set_platform_role", "role-plain-cmd", "moderator", stdout=out)
