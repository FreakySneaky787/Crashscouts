"""Reporting people and published feedback (WP 7.1, ADR 0026): reasons per target, visibility,
the moderation queue and case page, hiding feedback, warning a person."""

import pytest
from django.core import mail
from django.utils import timezone

from apps.campaigns import status
from apps.campaigns.models import Participation
from apps.campaigns.tests.test_campaigns import make_campaign
from apps.feedback.models import Feedback
from apps.moderation.models import ModerationNote, Report
from apps.projects.tests.test_projects import client_for, make_user, new_project

from .test_moderation import moderator

REPORTS = "/api/v1/reports/"
FEEDBACK = "/api/v1/projects/rep-app/campaigns/beta/feedback/"


@pytest.fixture
def scene(db, settings):
    settings.PUBLIC_CAMPAIGNS_ENABLED = True
    owner = make_user("rep-owner")
    project = new_project(owner, "rep-app", "public")
    campaign = make_campaign(project, status.PUBLISHED, "public", slug="beta")
    author = make_user("rep-author")
    other = make_user("rep-other")
    for person in (author, other):
        Participation.objects.create(campaign=campaign, user=person)
    published = Feedback.objects.create(
        campaign=campaign,
        author=author,
        kind="general",
        title="Spammy feedback",
        description="Buy cheap things",
        published_at=timezone.now(),
        publish_proposed_at=timezone.now(),
        author_consented_at=timezone.now(),
    )
    private = Feedback.objects.create(
        campaign=campaign, author=author, kind="general", title="Private", description="x"
    )
    return {
        "owner": owner,
        "author": author,
        "other": other,
        "stranger": make_user("rep-stranger"),
        "published": published,
        "private": private,
        "mod": moderator("rep-mod"),
    }


def report_user(reporter, username, reason="spam"):
    data = {"target_type": "user", "username": username, "reason": reason}
    return client_for(reporter).post(REPORTS, data, format="json")


def report_feedback(reporter, feedback, reason="spam"):
    data = {
        "target_type": "feedback",
        "project": "rep-app",
        "campaign": "beta",
        "feedback": str(feedback.pk),
        "reason": reason,
    }
    return client_for(reporter).post(REPORTS, data, format="json")


def act(scene, target_type, target, action, **data):
    url = f"/api/v1/moderation/cases/{target_type}/{target.pk}/{action}/"
    return client_for(scene["mod"]).post(url, data, format="json")


# --- Reporting people -----------------------------------------------------------------------


@pytest.mark.parametrize("reason", ["spam", "harassment", "impersonation", "inappropriate_profile"])
def test_people_are_reported_with_their_own_reasons(scene, reason):
    assert report_user(scene["stranger"], "rep-author", reason).status_code == 201
    found = Report.objects.get()
    assert (found.target_type, found.user, found.target_label) == (
        "user",
        scene["author"],
        "@rep-author (/u/rep-author)",
    )


def test_rules_for_reporting_people(scene):
    stranger = scene["stranger"]
    assert report_user(stranger, "rep-author", "malware").json() == {"code": "invalid_reason"}
    assert report_user(stranger, "nobody-here").status_code == 404
    assert report_user(stranger, "rep-stranger").status_code == 404  # not oneself
    assert report_user(stranger, "REP-AUTHOR").status_code == 201  # case-insensitive
    assert report_user(stranger, "rep-author").json() == {"code": "already_reported"}
    unconfirmed = make_user("rep-unconfirmed", verified=False)
    assert report_user(make_user("rep-reporter"), "rep-unconfirmed").status_code == 404
    assert report_user(unconfirmed, "rep-author").json() == {"code": "email_unconfirmed"}
    scene["other"].deletion_scheduled_for = timezone.now()
    scene["other"].save()
    assert report_user(stranger, "rep-other").status_code == 404  # waiting for deletion


# --- Reporting published feedback -----------------------------------------------------------


def test_published_feedback_is_reported_by_people_who_see_it(scene):
    assert report_feedback(scene["stranger"], scene["published"]).status_code == 201
    assert report_feedback(scene["other"], scene["published"], "harassment").status_code == 201
    assert report_feedback(scene["stranger"], scene["published"], "malware").json() == {
        "code": "invalid_reason"
    }


def test_private_and_own_feedback_cannot_be_reported(scene):
    assert report_feedback(scene["other"], scene["private"]).status_code == 404  # not published
    assert report_feedback(scene["author"], scene["published"]).status_code == 404  # own
    assert client_for().post(REPORTS, {}, format="json").status_code in {401, 403}
    assert not Report.objects.exists()


# --- Moderation -----------------------------------------------------------------------------


def test_the_queue_and_case_page_show_people_and_feedback(scene):
    report_user(scene["stranger"], "rep-author", "harassment")
    report_feedback(scene["stranger"], scene["published"])
    cases = client_for(scene["mod"]).get("/api/v1/moderation/cases/").json()
    titles = {(c["target_type"], c["title"]) for c in cases}
    assert ("user", "@rep-author") in titles
    assert ("feedback", "Spammy feedback") in titles
    case = (
        client_for(scene["mod"]).get(f"/api/v1/moderation/cases/user/{scene['author'].pk}/").json()
    )
    assert case["username"] == "rep-author"
    assert case["reports"][0]["reason"] == "harassment"
    for user in (scene["stranger"], scene["owner"], None):
        url = f"/api/v1/moderation/cases/user/{scene['author'].pk}/"
        assert client_for(user).get(url).status_code in {401, 403, 404}


def test_moderators_hide_and_restore_published_feedback(scene, django_capture_on_commit_callbacks):
    feedback = scene["published"]
    report_feedback(scene["stranger"], feedback)
    with django_capture_on_commit_callbacks(execute=True):
        response = act(scene, "feedback", feedback, "block", category="spam", message="Spam.")
    assert response.status_code == 204, response.content
    feedback.refresh_from_db()
    assert feedback.blocked_at is not None
    assert feedback.published_at is None  # private again
    recipients = {m.to[0] for m in mail.outbox}
    assert {"rep-owner@example.test", "rep-author@example.test"} <= recipients
    # Hidden from everyone but the team and the author, who see the reason.
    for user in (None, scene["stranger"], scene["other"]):
        assert client_for(user).get(f"{FEEDBACK}{feedback.pk}/").status_code == 404
    for user in (scene["owner"], scene["author"]):
        body = client_for(user).get(f"{FEEDBACK}{feedback.pk}/").json()
        assert body["moderation"]["message"] == "Spam."
    titles = [f["title"] for f in client_for(scene["other"]).get(FEEDBACK).json()]
    assert "Spammy feedback" not in titles
    # Publishing is refused until the block is lifted.
    propose = client_for(scene["owner"]).post(f"{FEEDBACK}{feedback.pk}/publish/propose/")
    assert propose.json() == {"code": "blocked"}
    from apps.moderation.models import Block

    block = Block.objects.get(feedback=feedback)
    lifted = client_for(scene["mod"]).post(f"/api/v1/moderation/blocks/{block.pk}/lift/")
    assert lifted.status_code == 204
    assert client_for(scene["other"]).get(f"{FEEDBACK}{feedback.pk}/").status_code == 200
    assert client_for().get(f"{FEEDBACK}{feedback.pk}/").status_code == 404  # still private


def test_moderators_warn_a_person(scene, django_capture_on_commit_callbacks):
    report_user(scene["stranger"], "rep-author", "spam")
    with django_capture_on_commit_callbacks(execute=True):
        response = act(scene, "user", scene["author"], "warn", message="Please stop spamming.")
    assert response.status_code == 204, response.content
    assert mail.outbox[-1].to == ["rep-author@example.test"]
    assert "Please stop spamming." in mail.outbox[-1].body
    assert ModerationNote.objects.get().user == scene["author"]
    assert Report.objects.get().status == "resolved"
    case = (
        client_for(scene["mod"]).get(f"/api/v1/moderation/cases/user/{scene['author'].pk}/").json()
    )
    assert case["notes"][0]["text"] == "Please stop spamming."
    # People are suspended (WP 7.2), not blocked like content.
    blocked = act(scene, "user", scene["author"], "block", category="spam", message="x")
    assert blocked.json() == {"code": "not_supported"}
