"""Metrics data foundation and the application question builder (WP 3A.4b, part 1)."""

import importlib

import pytest
from django.apps import apps as django_apps

from apps.audit.models import AuditEvent
from apps.campaigns import status
from apps.campaigns.models import ApplicationQuestion, Campaign
from apps.projects.tests.test_projects import client_for, make_user, new_project

from .test_campaigns import make_campaign, payload

BASE = "/api/v1/projects/quiz-app/campaigns/"


@pytest.fixture
def team(db, settings):
    settings.PUBLIC_CAMPAIGNS_ENABLED = True
    owner = make_user("quiz-owner")
    maintainer = make_user("quiz-maint")
    project = new_project(owner, "quiz-app", "public", [maintainer])
    return {"owner": owner, "maintainer": maintainer, "project": project}


def approval_draft(team, slug: str = "apply-beta") -> Campaign:
    response = client_for(team["owner"]).post(
        BASE,
        payload(slug=slug, visibility="public", participation="approval"),
        format="json",
    )
    assert response.status_code == 201, response.content
    return Campaign.objects.get(slug=slug)


# --- Metrics data foundation ------------------------------------------------------------------


def test_state_changes_record_when_and_who(team):
    campaign = make_campaign(team["project"], status.DRAFT, "private", slug="timed")
    url = f"{BASE}timed/"
    client_for(team["maintainer"]).post(f"{url}publish/")
    campaign.refresh_from_db()
    assert campaign.published_at is not None
    assert campaign.published_by == team["maintainer"]
    client_for(team["owner"]).post(f"{url}complete/")
    campaign.refresh_from_db()
    assert campaign.completed_at >= campaign.published_at
    assert campaign.published_by == team["maintainer"]  # unchanged by completing
    other = make_campaign(team["project"], status.DRAFT, "private", slug="dropped")
    client_for(team["owner"]).post(f"{BASE}dropped/cancel/")
    other.refresh_from_db()
    assert other.cancelled_at is not None
    assert other.published_at is None


def test_published_by_is_cleared_when_the_account_is_deleted(team):
    campaign = make_campaign(team["project"], status.DRAFT, "private", slug="gone")
    client_for(team["maintainer"]).post(f"{BASE}gone/publish/")
    team["maintainer"].delete()
    campaign.refresh_from_db()
    assert campaign.published_by is None
    assert campaign.published_at is not None  # the campaign still counts


def test_backfill_takes_times_and_publisher_from_the_audit_log(team):
    campaign = make_campaign(team["project"], status.DRAFT, "private", slug="old-one")
    client_for(team["owner"]).post(f"{BASE}old-one/publish/")
    client_for(team["owner"]).post(f"{BASE}old-one/cancel/")
    published = AuditEvent.objects.get(kind="campaign.published")
    cancelled = AuditEvent.objects.get(kind="campaign.cancelled")
    Campaign.objects.filter(pk=campaign.pk).update(
        published_at=None, published_by=None, cancelled_at=None
    )
    migration = importlib.import_module("apps.campaigns.migrations.0006_backfill_state_timestamps")
    migration.backfill(django_apps, None)
    campaign.refresh_from_db()
    assert campaign.published_at == published.created_at
    assert campaign.published_by == team["owner"]
    assert campaign.cancelled_at == cancelled.created_at
    assert campaign.completed_at is None


# --- Question builder ---------------------------------------------------------------------------


def test_approval_campaigns_start_with_the_short_message_template(team):
    campaign = approval_draft(team)
    [question] = ApplicationQuestion.objects.filter(campaign=campaign)
    assert (question.kind, question.required) == ("long_text", False)
    body = client_for(team["owner"]).get(f"{BASE}apply-beta/questions/").json()
    assert body["templates"] == ["short_message", "device", "experience", "availability"]
    # Private campaigns (invitations) have no applications and no default question.
    client_for(team["owner"]).post(BASE, payload(slug="private-one"), format="json")
    assert not ApplicationQuestion.objects.filter(campaign__slug="private-one").exists()


def test_the_team_builds_questions_from_templates_and_its_own(team):
    approval_draft(team)
    owner = client_for(team["maintainer"])
    url = f"{BASE}apply-beta/questions/"
    response = owner.post(f"{url}template/experience/")
    assert response.status_code == 201
    assert response.json()["options"] == ["None yet", "Some", "A lot"]
    response = owner.post(
        url,
        {"prompt": " Which browser? ", "kind": "single_choice", "options": ["Firefox", " Chrome "]},
        format="json",
    )
    assert response.json()["prompt"] == "Which browser?"
    assert response.json()["options"] == ["Firefox", "Chrome"]
    question_id = response.json()["id"]
    assert owner.patch(f"{url}{question_id}/", {"required": True}, format="json").json()["required"]
    assert owner.delete(f"{url}{question_id}/").status_code == 204
    assert len(owner.get(url).json()["questions"]) == 2


@pytest.mark.parametrize(
    ("data", "field", "code"),
    [
        ({"prompt": "", "kind": "short_text"}, "prompt", "blank"),
        ({"prompt": "x" * 201, "kind": "short_text"}, "prompt", "max_length"),
        (
            {"prompt": "Pick", "kind": "single_choice", "options": ["Only"]},
            "options",
            "too_few_options",
        ),
        (
            {"prompt": "Pick", "kind": "single_choice", "options": ["A", "A"]},
            "options",
            "duplicate_options",
        ),
        (
            {"prompt": "Pick", "kind": "single_choice", "options": [str(n) for n in range(11)]},
            "options",
            "max_length",
        ),
        ({"prompt": "Pick", "kind": "essay"}, "kind", "invalid_choice"),
    ],
)
def test_invalid_questions_are_rejected(team, data, field, code):
    approval_draft(team)
    response = client_for(team["owner"]).post(f"{BASE}apply-beta/questions/", data, format="json")
    assert response.status_code == 400
    assert code in response.json()[field]


def test_options_are_dropped_for_questions_without_choices(team):
    approval_draft(team)
    response = client_for(team["owner"]).post(
        f"{BASE}apply-beta/questions/",
        {"prompt": "Anything else?", "kind": "long_text", "options": ["stray"]},
        format="json",
    )
    assert response.json()["options"] == []


def test_at_most_ten_questions_and_known_templates_only(team):
    approval_draft(team)
    url = f"{BASE}apply-beta/questions/"
    owner = client_for(team["owner"])
    for number in range(9):
        assert (
            owner.post(url, {"prompt": f"Q{number}", "kind": "yes_no"}, format="json").status_code
            == 201
        )
    assert owner.post(url, {"prompt": "Q10", "kind": "yes_no"}, format="json").json() == {
        "code": "too_many_questions"
    }
    assert owner.post(f"{url}template/nonsense/").json() == {"code": "unknown_template"}


def test_questions_are_frozen_once_published(team):
    campaign = approval_draft(team)
    question = ApplicationQuestion.objects.get(campaign=campaign)
    owner = client_for(team["owner"])
    owner.post(f"{BASE}apply-beta/publish/")
    url = f"{BASE}apply-beta/questions/"
    assert owner.post(url, {"prompt": "Late", "kind": "yes_no"}, format="json").json() == {
        "code": "questions_locked"
    }
    assert owner.patch(f"{url}{question.pk}/", {"prompt": "x"}, format="json").json() == {
        "code": "questions_locked"
    }
    assert owner.delete(f"{url}{question.pk}/").json() == {"code": "questions_locked"}
    # Applicants (anyone who sees the published campaign) can read them.
    assert len(client_for().get(url).json()["questions"]) == 1


def test_only_the_team_changes_questions(team):
    approval_draft(team)
    owner = client_for(team["owner"])
    owner.post(f"{BASE}apply-beta/publish/")
    stranger = client_for(make_user("quiz-stranger"))
    url = f"{BASE}apply-beta/questions/"
    assert stranger.post(url, {"prompt": "x", "kind": "yes_no"}, format="json").status_code == 403
    question_id = owner.get(url).json()["questions"][0]["id"]
    assert stranger.delete(f"{url}{question_id}/").status_code == 403
    # Drafts (and their questions) stay invisible to everyone outside the team.
    approval_draft(team, "second-beta")
    assert stranger.get(f"{BASE}second-beta/questions/").status_code == 404


def test_invitation_campaigns_take_no_questions(team):
    make_campaign(team["project"], status.DRAFT, "private", slug="invite-only")
    response = client_for(team["owner"]).post(
        f"{BASE}invite-only/questions/", {"prompt": "x", "kind": "yes_no"}, format="json"
    )
    assert response.json() == {"code": "no_applications"}
