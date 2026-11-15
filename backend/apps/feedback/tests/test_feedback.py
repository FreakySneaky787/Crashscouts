"""Feedback (WP 5.1, ADR 0024): types, permissions, status workflow, publishing, personal data."""

import pytest
from django.core import mail
from django.core.cache import cache

from apps.accounts.lifecycle import export_data
from apps.audit.models import AuditEvent
from apps.campaigns import status
from apps.campaigns.models import Participation, TestTask
from apps.campaigns.tests.test_campaigns import make_campaign
from apps.feedback.models import Feedback
from apps.moderation.tests.test_moderation import moderator
from apps.projects.tests.test_projects import client_for, make_user, new_project

BASE = "/api/v1/projects/fb-app/campaigns/beta/feedback/"


def join(campaign, username, state=Participation.Status.ACTIVE):
    user = make_user(username)
    Participation.objects.create(campaign=campaign, user=user, status=state)
    return user


def give(user, **fields):
    data = {"kind": "general", "title": "Looks good", "description": "Works on my machine."}
    return client_for(user).post(BASE, {**data, **fields}, format="json")


def url(feedback, tail=""):
    return f"{BASE}{feedback.pk}/{tail}"


@pytest.fixture
def world(db, settings):
    settings.PUBLIC_CAMPAIGNS_ENABLED = True
    owner = make_user("fb-owner")
    maintainer = make_user("fb-maint")
    project = new_project(owner, "fb-app", "public", [maintainer])
    campaign = make_campaign(project, status.PUBLISHED, "public", slug="beta")
    world = {
        "owner": owner,
        "maintainer": maintainer,
        "project": project,
        "campaign": campaign,
        "author": join(campaign, "fb-author"),
        "other": join(campaign, "fb-other"),
        "leaver": join(campaign, "fb-leaver", Participation.Status.LEFT),
        "stranger": make_user("fb-stranger"),
        "mod": moderator("fb-mod"),
    }
    response = give(world["author"], title="Private finding", description="Secret details")
    assert response.status_code == 201, response.content
    world["feedback"] = Feedback.objects.get(pk=response.json()["id"])
    return world


# --- Creating -------------------------------------------------------------------------------


def test_each_kind_has_its_fields(world):
    author = world["author"]
    bug = give(author, kind="bug", title="Crash", steps="1. Open", expected="Opens", actual="Crash")
    assert bug.status_code == 201, bug.content
    assert bug.json()["version"] == "1.0"  # the campaign's version by default
    assert give(author, kind="bug").json() == {
        "steps": ["required"],
        "expected": ["required"],
        "actual": ["required"],
    }
    assert give(author, kind="feature").json() == {"solution": ["required"]}
    assert give(author, kind="compatibility").json() == {
        "platform": ["required"],
        "result": ["required"],
    }
    compat = give(author, kind="compatibility", platform="linux", result="partly")
    assert compat.json()["platform"]["slug"] == "linux"
    # Fields that do not belong to the kind are cleared.
    ux = give(author, kind="ux", location="Settings", steps="ignored", platform="linux")
    assert (ux.json()["location"], ux.json()["steps"], ux.json()["platform"]) == (
        "Settings",
        "",
        None,
    )
    assert give(author, title="  ", description="").json() == {
        "title": ["blank"],
        "description": ["blank"],
    }
    assert give(author, kind="nonsense").json() == {"kind": ["invalid_choice"]}


def test_feedback_can_name_a_task_of_the_campaign(world):
    task = TestTask.objects.create(campaign=world["campaign"], title="Import")
    response = give(world["author"], task=str(task.pk))
    assert response.json()["task"] == {"id": str(task.pk), "title": "Import"}
    other = make_campaign(world["project"], status.PUBLISHED, "public", slug="other")
    foreign = TestTask.objects.create(campaign=other, title="Elsewhere")
    assert give(world["author"], task=str(foreign.pk)).json() == {"task": ["invalid"]}
    task.hidden_at = task.created_at
    task.save()
    assert give(world["author"], task=str(task.pk)).json() == {"task": ["invalid"]}


@pytest.mark.parametrize(
    ("who", "code"),
    [("stranger", "not_participant"), ("leaver", "not_participant"), ("owner", "not_participant")],
)
def test_only_active_participants_give_feedback(world, who, code):
    assert give(world[who]).json() == {"code": code}


def test_no_feedback_from_anonymous_or_in_closed_campaigns(world):
    assert client_for().post(BASE, {}, format="json").status_code == 401
    world["campaign"].state = "completed"
    world["campaign"].save()
    assert give(world["author"]).json() == {"code": "campaign_closed"}


# --- Who sees what (permission matrix) ----------------------------------------------------------

PRIVATE_READERS = {"author", "other", "owner", "maintainer"}
EVERYONE = ["anonymous", "stranger", "leaver", "mod", "author", "other", "owner", "maintainer"]


def _client(world, who):
    return client_for(None if who == "anonymous" else world[who])


@pytest.mark.parametrize("who", EVERYONE)
def test_private_feedback_is_seen_by_team_author_and_participants_only(world, who):
    client = _client(world, who)
    titles = [f["title"] for f in client.get(BASE).json()]
    detail = client.get(url(world["feedback"]))
    if who in PRIVATE_READERS:
        assert titles == ["Private finding"]
        assert detail.status_code == 200
    else:
        assert titles == []
        assert detail.status_code == 404
        assert "Secret details" not in detail.content.decode()


@pytest.mark.parametrize("who", EVERYONE)
def test_published_feedback_is_seen_by_everyone_who_sees_the_campaign(world, who):
    feedback = world["feedback"]
    client_for(world["owner"]).post(url(feedback, "publish/propose/"))
    client_for(world["author"]).post(url(feedback, "publish/consent/"))
    assert _client(world, who).get(url(feedback)).status_code == 200


def test_private_campaigns_and_blocked_content_hide_feedback(world):
    feedback = world["feedback"]
    world["campaign"].blocked_at = world["campaign"].updated_at
    world["campaign"].save()
    for who in ("author", "other", "stranger"):
        assert _client(world, who).get(url(feedback)).status_code == 404
    assert client_for(world["owner"]).get(url(feedback)).status_code == 200
    assert client_for(world["author"]).get("/api/v1/me/feedback/").json() == []


def test_others_do_not_learn_who_wrote_it(world):
    feedback = world["feedback"]
    assert client_for(world["other"]).get(url(feedback)).json()["author"] is None
    assert client_for(world["owner"]).get(url(feedback)).json()["author"] == "fb-author"
    assert client_for(world["author"]).get(url(feedback)).json()["author"] == "fb-author"


def test_the_list_decides_the_team_once_and_still_hides_the_author(world):
    """WP 8.6: the inbox checked the membership three times per item; now once per list."""
    from django.db import connection
    from django.test.utils import CaptureQueriesContext

    def inbox(user):
        with CaptureQueriesContext(connection) as captured:
            items = client_for(user).get(BASE).json()
        return items, len(captured)

    items, few = inbox(world["owner"])
    for index in range(4):
        assert give(world["other"], title=f"More {index}").status_code == 201
    items, many = inbox(world["owner"])
    assert many == few
    assert len(items) == 5
    assert all(item["can_manage"] for item in items)
    assert {item["author"] for item in items} == {"fb-author", "fb-other"}
    seen_by_other = client_for(world["other"]).get(BASE).json()
    assert not any(item["can_manage"] for item in seen_by_other)
    assert {item["author"] for item in seen_by_other} == {None, "fb-other"}
    assert all(item["attachments"] == [] for item in seen_by_other)


# --- Changing and withdrawing ---------------------------------------------------------------


def test_the_author_changes_and_withdraws_only_while_new(world):
    feedback = world["feedback"]
    author = client_for(world["author"])
    assert (
        author.patch(url(feedback), {"title": "Better title"}, format="json").json()["title"]
        == "Better title"
    )
    for who in ("other", "owner"):
        response = client_for(world[who]).patch(url(feedback), {"title": "x"}, format="json")
        assert response.status_code == 403
        assert client_for(world[who]).delete(url(feedback)).status_code == 403
    reviewed = client_for(world["owner"]).post(
        url(feedback, "status/"), {"status": "reviewed"}, format="json"
    )
    assert reviewed.status_code == 200
    assert author.patch(url(feedback), {"title": "Late"}, format="json").json() == {
        "code": "feedback_locked"
    }
    assert author.delete(url(feedback)).json() == {"code": "feedback_locked"}
    second = Feedback.objects.get(pk=give(world["author"]).json()["id"])
    assert author.delete(url(second)).status_code == 204
    assert not Feedback.objects.filter(pk=second.pk).exists()


# --- Status workflow ------------------------------------------------------------------------


def set_status(world, who, value, **extra):
    return client_for(world[who]).post(
        url(world["feedback"], "status/"), {"status": value, **extra}, format="json"
    )


def test_the_team_sets_statuses_and_the_author_is_told(world, django_capture_on_commit_callbacks):
    with django_capture_on_commit_callbacks(execute=True):
        response = set_status(world, "maintainer", "confirmed")
    assert response.json()["status"] == "confirmed"
    assert len(mail.outbox) == 1
    assert mail.outbox[0].to == ["fb-author@example.test"]
    assert "Confirmed" in mail.outbox[0].subject
    for value in ("in_progress", "rejected", "reviewed"):
        assert set_status(world, "owner", value).status_code == 200
    assert set_status(world, "owner", "verified").json() == {"code": "invalid_status"}
    assert set_status(world, "owner", "new").json() == {"code": "invalid_status"}
    assert set_status(world, "owner", "done").json() == {"status": ["invalid_choice"]}
    history = client_for(world["author"]).get(url(world["feedback"])).json()["history"]
    assert [(h["status"], h["role"]) for h in history][:2] == [
        ("confirmed", "team"),
        ("in_progress", "team"),
    ]
    assert all("actor" not in h for h in history)


def test_the_author_verifies_or_reopens_a_fix_only(world, django_capture_on_commit_callbacks):
    assert set_status(world, "author", "fixed").json() == {"code": "invalid_status"}
    assert set_status(world, "author", "verified").json() == {"code": "invalid_status"}
    set_status(world, "owner", "fixed")
    assert client_for(world["author"]).get(url(world["feedback"])).json()["can_verify"] is True
    with django_capture_on_commit_callbacks(execute=True):
        assert set_status(world, "author", "confirmed").json()["status"] == "confirmed"  # reopened
    assert mail.outbox == []  # the author is not mailed about their own change
    set_status(world, "owner", "fixed")
    assert set_status(world, "author", "verified").json()["status"] == "verified"
    assert set_status(world, "other", "rejected").status_code == 403
    assert set_status(world, "stranger", "rejected").status_code == 404


def test_duplicates_point_to_feedback_of_the_same_campaign(world):
    original = Feedback.objects.get(pk=give(world["other"], title="First").json()["id"])
    assert set_status(world, "owner", "duplicate").json() == {"code": "invalid_duplicate"}
    elsewhere = make_campaign(world["project"], status.PUBLISHED, "public", slug="else")
    foreign = Feedback.objects.create(
        campaign=elsewhere, author=world["other"], kind="general", title="x", description="x"
    )
    assert set_status(world, "owner", "duplicate", duplicate_of=str(foreign.pk)).json() == {
        "code": "invalid_duplicate"
    }
    assert set_status(
        world, "owner", "duplicate", duplicate_of=str(world["feedback"].pk)
    ).json() == {"code": "invalid_duplicate"}
    response = set_status(world, "owner", "duplicate", duplicate_of=str(original.pk))
    assert response.json()["duplicate_of"] == {"id": str(original.pk), "title": "First"}
    assert set_status(world, "owner", "confirmed").json()["duplicate_of"] is None


# --- Publishing -----------------------------------------------------------------------------


def test_publishing_needs_the_team_and_the_author(world):
    feedback = world["feedback"]
    author, owner = client_for(world["author"]), client_for(world["owner"])
    assert author.post(url(feedback, "publish/consent/")).json() == {"code": "not_proposed"}
    assert author.post(url(feedback, "publish/propose/")).status_code == 403
    assert client_for(world["other"]).post(url(feedback, "publish/propose/")).status_code == 403
    proposed = owner.post(url(feedback, "publish/propose/")).json()
    assert (proposed["publish_proposed"], proposed["published"]) == (True, False)
    assert client_for().get(url(feedback)).status_code == 404  # not public before consent
    assert owner.post(url(feedback, "publish/consent/")).status_code == 403
    assert author.post(url(feedback, "publish/consent/")).json()["published"] is True
    assert client_for().get(url(feedback)).json()["title"] == "Private finding"
    assert author.post(url(feedback, "publish/withdraw/")).json()["published"] is False
    assert client_for().get(url(feedback)).status_code == 404
    kinds = list(AuditEvent.objects.values_list("kind", flat=True))
    assert kinds.count(AuditEvent.Kind.FEEDBACK_PUBLISHED) == 1
    assert kinds.count(AuditEvent.Kind.FEEDBACK_UNPUBLISHED) == 1
    assert owner.post(url(feedback, "publish/nonsense/")).status_code == 404


# --- Counters, own list, limits -------------------------------------------------------------


def test_the_team_sees_how_much_new_feedback_there_is(world):
    campaign_url = "/api/v1/projects/fb-app/campaigns/beta/"
    assert client_for(world["owner"]).get(campaign_url).json()["new_feedback"] == 1
    assert client_for(world["author"]).get(campaign_url).json()["new_feedback"] is None
    set_status(world, "owner", "reviewed")
    assert client_for(world["owner"]).get(campaign_url).json()["new_feedback"] == 0


def test_authors_list_their_own_feedback_also_after_leaving(world):
    participation = Participation.objects.get(user=world["author"])
    participation.status = Participation.Status.LEFT
    participation.save()
    mine = client_for(world["author"]).get("/api/v1/me/feedback/").json()
    assert [(f["title"], f["status"], f["campaign_slug"]) for f in mine] == [
        ("Private finding", "new", "beta")
    ]
    assert client_for(world["author"]).get(url(world["feedback"])).status_code == 200
    assert client_for(world["other"]).get("/api/v1/me/feedback/").json() == []


def test_giving_feedback_is_rate_limited(world, monkeypatch):
    from rest_framework.throttling import ScopedRateThrottle

    assert ScopedRateThrottle.THROTTLE_RATES["feedback_create"] == "30/day"
    assert ScopedRateThrottle.THROTTLE_RATES["feedback_create_ip"] == "60/day"
    monkeypatch.setitem(ScopedRateThrottle.THROTTLE_RATES, "feedback_create", "2/day")
    cache.clear()
    assert [give(world["other"]).status_code for _ in range(3)] == [201, 201, 429]


# --- Personal data --------------------------------------------------------------------------


def test_own_feedback_is_exported_and_anonymised_on_deletion(world):
    exported = export_data(world["author"])["feedback"]
    assert [(f["title"], f["description"]) for f in exported] == [
        ("Private finding", "Secret details")
    ]
    assert export_data(world["other"])["feedback"] == []
    world["author"].delete()
    feedback = Feedback.objects.get(pk=world["feedback"].pk)
    assert feedback.author is None
    assert feedback.title == "Private finding"
    assert client_for(world["owner"]).get(url(feedback)).json()["author"] is None
