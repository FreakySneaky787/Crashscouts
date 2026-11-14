"""Account suspensions (WP 7.2, ADR 0027): the central write guard over every route, the rules
for suspending, the effects (read only, hidden profile), the end, lifting and the one appeal."""

import uuid
from datetime import timedelta

import pytest
from django.core import mail
from django.test import Client
from django.urls import URLPattern, URLResolver, get_resolver
from django.utils import timezone

from apps.accounts.lifecycle import export_data
from apps.audit.models import AuditEvent
from apps.moderation.middleware import ALLOWED_PATHS, is_allowed
from apps.moderation.models import AccountSuspension, Report
from apps.moderation.suspensions import is_suspended
from apps.projects.tests.test_projects import client_for, make_user

from .test_moderation import moderator

WRITE_METHODS = ("post", "put", "patch", "delete")
SAMPLE = {"uuid": str(uuid.uuid4()), "int": "1", "str": "x", "slug": "x", "path": "x"}


def _routes(resolver=None, prefix=""):
    """Every route of the project as a concrete path (placeholders filled with samples)."""
    resolver = resolver or get_resolver()
    for entry in resolver.url_patterns:
        pattern = prefix + str(entry.pattern)
        if isinstance(entry, URLResolver):
            yield from _routes(entry, pattern)
        elif isinstance(entry, URLPattern):
            yield pattern


def _concrete(pattern: str) -> str:
    import re

    filled = re.sub(r"<(?:(\w+):)?\w+>", lambda m: SAMPLE[m.group(1) or "str"], pattern)
    return "/" + filled


# API and authentication routes; the Django admin is never routed publicly (SECURITY.md §7) and
# uses regular expressions for its paths.
ROUTES = sorted(
    {_concrete(p) for p in _routes() if p.startswith(("api/", "_allauth/")) and "^" not in p}
)


@pytest.fixture
def scene(db):
    person = make_user("sus-person")
    mod = moderator("sus-mod")
    return {"person": person, "mod": mod, "other": make_user("sus-other")}


MOD = object()


def suspend(scene, *, ends_at="", category="spam", message="Spam everywhere.", by=MOD):
    data = {"category": category, "message": message}
    if ends_at != "":
        data["ends_at"] = ends_at
    url = f"/api/v1/moderation/cases/user/{scene['person'].pk}/suspend/"
    return client_for(scene["mod"] if by is MOD else by).post(url, data, format="json")


def session_for(user) -> Client:
    """A real session: the write guard sits in Django's middleware, before DRF."""
    client = Client()
    client.force_login(user)
    return client


def in_a_week():
    return (timezone.now() + timedelta(days=7)).isoformat()


# --- The write guard ------------------------------------------------------------------------


def test_the_allow_list_names_existing_routes_only():
    missing = ALLOWED_PATHS - set(ROUTES)
    assert not missing, missing


@pytest.mark.parametrize("path", [p for p in ROUTES if not is_allowed(p)])
def test_every_other_writing_route_is_refused_for_suspended_accounts(scene, path):
    assert suspend(scene, ends_at=None).status_code == 204
    client = session_for(scene["person"])
    for method in WRITE_METHODS:
        response = getattr(client, method)(path, {}, content_type="application/json")
        assert response.status_code == 403, (method, path, response.status_code)
        assert response.json() == {"code": "account_suspended"}, (method, path)
        assert client.get("/api/v1/me/profile/").status_code == 200  # still signed in, reads


def test_the_guard_leaves_other_accounts_and_reading_alone(scene):
    assert suspend(scene, ends_at=None).status_code == 204
    other = session_for(scene["other"])
    response = other.patch("/api/v1/me/profile/", {"bio": "Hi"}, content_type="application/json")
    assert response.status_code == 200
    person = session_for(scene["person"])
    for path in ("/api/v1/me/profile/", "/api/v1/me/suspension/", "/api/v1/me/reports/"):
        assert person.get(path).status_code == 200


def test_allowed_routes_pass_the_guard(scene):
    assert suspend(scene, ends_at=None).status_code == 204
    person = session_for(scene["person"])
    appeal = person.post(
        "/api/v1/me/suspension/appeal/", {"text": "Sorry."}, content_type="application/json"
    )
    assert appeal.status_code == 204
    export = person.post("/api/v1/me/export/", {}, content_type="application/json")
    assert export.json() != {"code": "account_suspended"}  # the view answers (password needed)
    assert person.delete("/_allauth/browser/v1/auth/session").status_code == 401  # signed out
    assert person.get("/api/v1/me/profile/").status_code in {401, 403}


# --- Suspending ------------------------------------------------------------------------------


def test_rules_for_suspending(scene):
    assert suspend(scene, ends_at=None, category="malware").json() == {"code": "invalid_category"}
    assert suspend(scene, ends_at=None, message=" ").json() == {"code": "message_required"}
    assert suspend(scene).json() == {"code": "end_required"}
    past = (timezone.now() - timedelta(minutes=1)).isoformat()
    assert suspend(scene, ends_at=past).json() == {"code": "end_in_past"}
    url = f"/api/v1/moderation/cases/user/{scene['mod'].pk}/suspend/"
    data = {"category": "spam", "message": "x", "ends_at": None}
    assert client_for(scene["mod"]).post(url, data, format="json").json() == {
        "code": "not_yourself"
    }
    other_mod = moderator("sus-mod-2")
    url = f"/api/v1/moderation/cases/user/{other_mod.pk}/suspend/"
    assert client_for(scene["mod"]).post(url, data, format="json").json() == {"code": "has_role"}
    for user in (scene["other"], None):  # only moderators
        assert suspend(scene, ends_at=None, by=user).status_code in {401, 403, 404}
    assert not AccountSuspension.objects.exists()
    assert suspend(scene, ends_at=in_a_week()).status_code == 204
    assert suspend(scene, ends_at=None).json() == {"code": "already_suspended"}


def test_a_suspension_closes_reports_mails_and_hides_the_profile(
    scene, django_capture_on_commit_callbacks
):
    reporter = make_user("sus-reporter")
    data = {"target_type": "user", "username": "sus-person", "reason": "harassment"}
    assert client_for(reporter).post("/api/v1/reports/", data, format="json").status_code == 201
    assert client_for().get("/api/v1/profiles/sus-person/").status_code == 200
    with django_capture_on_commit_callbacks(execute=True):
        assert suspend(scene, ends_at=in_a_week(), category="harassment").status_code == 204
    assert Report.objects.get().status == "resolved"
    suspended_mail = next(m for m in mail.outbox if m.to == ["sus-person@example.test"])
    assert "Spam everywhere." in suspended_mail.body
    assert "until" in suspended_mail.body
    assert client_for().get("/api/v1/profiles/sus-person/").status_code == 404
    assert client_for(reporter).post("/api/v1/reports/", data, format="json").status_code == 404
    event = AuditEvent.objects.get(kind=AuditEvent.Kind.ACCOUNT_SUSPENDED)
    assert (event.actor, event.subject, event.data["permanent"]) == (
        scene["mod"],
        scene["person"],
        False,
    )
    info = session_for(scene["person"]).get("/api/v1/me/suspension/").json()["suspension"]
    assert (info["category"], info["message"], info["appeal"]) == (
        "harassment",
        "Spam everywhere.",
        "none",
    )
    assert info["ends_at"] is not None


def test_the_suspension_ends_on_its_own(scene):
    assert suspend(scene, ends_at=in_a_week()).status_code == 204
    assert is_suspended(scene["person"])
    AccountSuspension.objects.update(ends_at=timezone.now() - timedelta(seconds=1))
    assert not is_suspended(scene["person"])
    person = session_for(scene["person"])
    assert person.get("/api/v1/me/suspension/").json() == {"suspension": None}
    response = person.patch("/api/v1/me/profile/", {"bio": "Back"}, content_type="application/json")
    assert response.status_code == 200
    assert client_for().get("/api/v1/profiles/sus-person/").status_code == 200
    assert suspend(scene, ends_at=None).status_code == 204  # a new one is possible


def test_moderators_lift_a_suspension(scene, django_capture_on_commit_callbacks):
    assert suspend(scene, ends_at=None).status_code == 204
    found = AccountSuspension.objects.get()
    url = f"/api/v1/moderation/account-suspensions/{found.pk}/lift/"
    assert client_for(scene["other"]).post(url).status_code == 404
    with django_capture_on_commit_callbacks(execute=True):
        assert client_for(moderator("sus-mod-2")).post(url).status_code == 204
    assert not is_suspended(scene["person"])
    assert "lifted" in mail.outbox[-1].subject
    assert client_for(scene["mod"]).post(url).json() == {"code": "not_suspended"}


# --- The appeal ------------------------------------------------------------------------------


def appeal(user, text="It was a misunderstanding."):
    return session_for(user).post(
        "/api/v1/me/suspension/appeal/", {"text": text}, content_type="application/json"
    )


@pytest.mark.parametrize(("decision", "still"), [("uphold", True), ("lift", False)])
def test_one_appeal_decided_by_any_moderator(
    scene, decision, still, django_capture_on_commit_callbacks
):
    assert suspend(scene, ends_at=None).status_code == 204
    assert appeal(scene["other"]).status_code == 404  # not suspended
    assert appeal(scene["person"], " ").json() == {"code": "message_required"}
    assert appeal(scene["person"], "x" * 1001).json() == {"code": "too_long"}
    assert appeal(scene["person"]).status_code == 204
    assert appeal(scene["person"]).json() == {"code": "already_appealed"}
    listed = client_for(scene["mod"]).get("/api/v1/moderation/account-suspensions/appeals/")
    assert [a["username"] for a in listed.json()] == ["sus-person"]
    assert listed.json()[0]["appeal_text"] == "It was a misunderstanding."
    found = AccountSuspension.objects.get()
    url = f"/api/v1/moderation/account-suspensions/{found.pk}/appeal/{decision}/"
    assert client_for(scene["other"]).post(url).status_code == 404
    with django_capture_on_commit_callbacks(execute=True):
        # The moderator who suspended may decide too (owner's decision 2026-11-14).
        assert client_for(scene["mod"]).post(url).status_code == 204
    assert is_suspended(scene["person"]) is still
    assert "appeal" in mail.outbox[-1].subject
    assert client_for(scene["mod"]).post(url).json() == {"code": "no_open_appeal"}
    assert (
        client_for(scene["mod"]).get("/api/v1/moderation/account-suspensions/appeals/").json() == []
    )
    found.refresh_from_db()
    assert found.appeal_decided_by == scene["mod"]


# --- Moderators' and admins' views -----------------------------------------------------------


def test_the_case_page_and_the_admin_list(scene):
    assert suspend(scene, ends_at=None).status_code == 204
    case = client_for(scene["mod"]).get(f"/api/v1/moderation/cases/user/{scene['person'].pk}/")
    body = case.json()
    assert body["active_suspension"] == str(AccountSuspension.objects.get().pk)
    assert body["suspensions"][0]["created_by"] == "sus-mod"
    assert body["can_suspend"] is True
    url = "/api/v1/moderation/account-suspensions/"
    assert client_for(scene["mod"]).get(url).status_code == 404  # admins only
    assert client_for(scene["other"]).get(url).status_code == 404
    admin = moderator("sus-admin")
    admin.platform_role = "admin"
    admin.save()
    listed = client_for(admin).get(url).json()
    assert [(s["username"], s["created_by"], s["active"]) for s in listed] == [
        ("sus-person", "sus-mod", True)
    ]


def test_the_data_export_contains_the_suspension_without_moderators(scene):
    assert suspend(scene, ends_at=None).status_code == 204
    [exported] = export_data(scene["person"])["suspensions"]
    assert (exported["reason"], exported["message"], exported["ends_at"]) == (
        "spam",
        "Spam everywhere.",
        None,
    )
    assert "sus-mod" not in str(exported)
