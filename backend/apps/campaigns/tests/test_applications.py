"""Applications (WP 3A.4b, part 2): apply, approve, reject, withdraw, answer retention."""

import threading
from datetime import timedelta
from io import StringIO

import pytest
from django.core import mail
from django.core.management import call_command
from django.db import connection
from django.utils import timezone

from apps.audit.models import AuditEvent
from apps.campaigns import status
from apps.campaigns.applications import approve
from apps.campaigns.models import (
    Application,
    ApplicationAnswer,
    ApplicationQuestion,
    Campaign,
    Participation,
)
from apps.campaigns.services import CampaignError
from apps.projects.tests.test_projects import client_for, make_user, new_project

from .test_campaigns import make_campaign

BASE = "/api/v1/projects/apply-app/campaigns/beta/"


def approval_campaign(project, slug: str = "beta", target: int = 2) -> Campaign:
    campaign = make_campaign(project, status.PUBLISHED, "public", slug=slug, target_testers=target)
    campaign.participation = Campaign.Participation.APPROVAL
    campaign.save()
    return campaign


@pytest.fixture
def setup(db, settings):
    settings.PUBLIC_CAMPAIGNS_ENABLED = True  # applications need a public campaign
    owner = make_user("app-owner")
    maintainer = make_user("app-maint")
    project = new_project(owner, "apply-app", "public", [maintainer])
    campaign = approval_campaign(project)
    device = ApplicationQuestion.objects.create(
        campaign=campaign, prompt="Device?", kind="short_text", required=True, position=0
    )
    level = ApplicationQuestion.objects.create(
        campaign=campaign,
        prompt="Experience?",
        kind="single_choice",
        options=["None", "Some"],
        position=1,
    )
    available = ApplicationQuestion.objects.create(
        campaign=campaign, prompt="Available?", kind="yes_no", position=2
    )
    return {
        "owner": owner,
        "maintainer": maintainer,
        "project": project,
        "campaign": campaign,
        "q": {"device": device, "level": level, "available": available},
    }


def answers(setup, **values) -> dict:
    q = setup["q"]
    data = {"device": "Laptop with Fedora", "level": "Some", "available": "yes"}
    data.update(values)
    return {str(q[key].pk): value for key, value in data.items() if value is not None}


def apply_as(user, setup, base: str = BASE, **values):
    return client_for(user).post(
        f"{base}apply/", {"answers": answers(setup, **values)}, format="json"
    )


def pending(setup) -> list[dict]:
    return client_for(setup["owner"]).get(f"{BASE}applications/").json()


def decide(user, application_id: str, decision: str):
    return client_for(user).post(f"{BASE}applications/{application_id}/{decision}/")


def test_apply_and_get_approved(setup, django_capture_on_commit_callbacks):
    tester = make_user("app-tester")
    response = apply_as(tester, setup)
    assert response.status_code == 201, response.content
    assert response.json()["my_application"] == "pending"
    team_view = client_for(setup["maintainer"]).get(BASE).json()
    assert team_view["open_applications"] == 1
    assert client_for(tester).get(BASE).json()["open_applications"] is None  # team only

    [entry] = pending(setup)
    assert entry["username"] == "app-tester"
    assert [(a["prompt"], a["value"]) for a in entry["answers"]] == [
        ("Device?", "Laptop with Fedora"),
        ("Experience?", "Some"),
        ("Available?", "yes"),
    ]
    with django_capture_on_commit_callbacks(execute=True):
        assert decide(setup["maintainer"], entry["id"], "approve").status_code == 204
    assert any("You take part in Campaign" in m.subject for m in mail.outbox)
    assert client_for(tester).get(BASE).json()["is_participant"] is True
    assert client_for(tester).get(f"{BASE}links/").status_code == 200
    joined = AuditEvent.objects.get(kind=AuditEvent.Kind.CAMPAIGN_PARTICIPANT_JOINED)
    assert joined.data["via"] == "application"
    assert AuditEvent.objects.filter(kind=AuditEvent.Kind.CAMPAIGN_APPLICATION_APPROVED).exists()
    assert pending(setup) == []


def test_rejection_deletes_the_answers_and_blocks_reapplying(
    setup, django_capture_on_commit_callbacks
):
    tester = make_user("app-rejected")
    apply_as(tester, setup)
    [entry] = pending(setup)
    with django_capture_on_commit_callbacks(execute=True):
        assert decide(setup["owner"], entry["id"], "reject").status_code == 204
    assert not ApplicationAnswer.objects.exists()
    assert any("Your application for Campaign" in m.subject for m in mail.outbox)
    assert apply_as(tester, setup).json() == {"code": "rejected"}
    mine = client_for(tester).get("/api/v1/me/applications/").json()
    assert [a["status"] for a in mine] == ["rejected"]


def test_withdraw_deletes_answers_and_allows_a_new_application(setup):
    tester = make_user("app-withdraw")
    apply_as(tester, setup)
    assert apply_as(tester, setup).json() == {"code": "already_applied"}
    assert client_for(tester).post(f"{BASE}withdraw/").status_code == 204
    assert not ApplicationAnswer.objects.exists()
    assert client_for(tester).post(f"{BASE}withdraw/").json() == {"code": "no_open_application"}
    assert apply_as(tester, setup, device="Phone").status_code == 201
    assert Application.objects.filter(applicant=tester).count() == 1  # the row is reused
    assert ApplicationAnswer.objects.get(prompt="Device?").value == "Phone"


@pytest.mark.parametrize(
    ("values", "code"),
    [
        ({"device": None}, "answer_required"),
        ({"device": "   "}, "answer_required"),
        ({"device": "x" * 201}, "invalid_answers"),
        ({"level": "Expert"}, "invalid_answers"),
        ({"available": "maybe"}, "invalid_answers"),
    ],
)
def test_answers_are_validated(setup, values, code):
    assert apply_as(make_user("app-invalid"), setup, **values).json() == {"code": code}
    assert not Application.objects.exists()


def test_unknown_questions_and_wrong_shapes_are_rejected(setup):
    client = client_for(make_user("app-shape"))
    bad = answers(setup)
    bad["00000000-0000-0000-0000-000000000000"] = "sneaky"
    assert client.post(f"{BASE}apply/", {"answers": bad}, format="json").json() == {
        "code": "invalid_answers"
    }
    assert client.post(f"{BASE}apply/", {"answers": ["list"]}, format="json").json() == {
        "code": "invalid_answers"
    }


def test_answers_are_visible_to_the_team_only(setup):
    tester = make_user("app-private")
    other = make_user("app-other")
    apply_as(tester, setup)
    application_id = pending(setup)[0]["id"]
    for user in (tester, other):
        client = client_for(user)
        assert client.get(f"{BASE}applications/").status_code == 404
        assert decide(user, application_id, "approve").status_code == 404
    assert client_for().get(f"{BASE}applications/").status_code in {401, 403}
    assert Application.objects.get().status == "pending"


def test_who_cannot_apply(setup):
    assert apply_as(setup["maintainer"], setup).json() == {"code": "team_member"}
    unconfirmed = make_user("app-unconfirmed", verified=False)
    assert apply_as(unconfirmed, setup).json() == {"code": "email_unconfirmed"}
    direct = make_campaign(setup["project"], status.PUBLISHED, "public", slug="direct-one")
    base = f"/api/v1/projects/apply-app/campaigns/{direct.slug}/"
    response = client_for(make_user("app-direct")).post(
        f"{base}apply/", {"answers": {}}, format="json"
    )
    assert response.json() == {"code": "no_applications"}


def test_full_campaigns_keep_applications_open_but_take_no_new_ones(setup):
    first, second, third, late = (make_user(f"app-full-{n}") for n in range(4))
    for user in (first, second, third):
        apply_as(user, setup)
    ids = [entry["id"] for entry in pending(setup)]
    assert decide(setup["owner"], ids[0], "approve").status_code == 204
    assert decide(setup["owner"], ids[1], "approve").status_code == 204
    assert decide(setup["owner"], ids[2], "approve").json() == {"code": "campaign_full"}
    assert len(pending(setup)) == 1  # still open
    assert apply_as(late, setup).json() == {"code": "campaign_full"}
    # A place becomes free: now the open application can be approved.
    client_for(first).post(f"{BASE}leave/")
    assert decide(setup["owner"], ids[2], "approve").status_code == 204
    # Withdrawing is always possible, also when full.
    assert client_for(late).post(f"{BASE}withdraw/").json() == {"code": "no_open_application"}


def test_leaving_and_removal_delete_the_answers(setup):
    leaver = make_user("app-leaver")
    removed = make_user("app-removed")
    for user in (leaver, removed):
        apply_as(user, setup)
    for entry in pending(setup):
        decide(setup["owner"], entry["id"], "approve")
    assert ApplicationAnswer.objects.count() == 6
    client_for(leaver).post(f"{BASE}leave/")
    client_for(setup["owner"]).delete(f"{BASE}participants/app-removed/")
    assert not ApplicationAnswer.objects.exists()
    assert apply_as(removed, setup).json() == {"code": "removed"}


def test_answers_are_purged_30_days_after_the_campaign_ended(setup):
    tester = make_user("app-purge")
    apply_as(tester, setup)
    decide(setup["owner"], pending(setup)[0]["id"], "approve")
    campaign = setup["campaign"]
    campaign.state = status.COMPLETED
    campaign.completed_at = timezone.now() - timedelta(days=29)
    campaign.save()
    out = StringIO()
    call_command("purge_application_answers", stdout=out)
    assert "Deleted application answers: 0" in out.getvalue()
    assert ApplicationAnswer.objects.count() == 3
    campaign.completed_at = timezone.now() - timedelta(days=31)
    campaign.save()
    call_command("purge_application_answers", stdout=out)
    assert not ApplicationAnswer.objects.exists()
    assert Participation.objects.filter(user=tester, status="active").exists()  # only answers go


def test_running_campaigns_keep_their_answers(setup):
    apply_as(make_user("app-running"), setup)
    call_command("purge_application_answers", stdout=StringIO())
    assert ApplicationAnswer.objects.count() == 3


@pytest.mark.django_db(transaction=True, serialized_rollback=True)
def test_concurrent_approvals_respect_the_limit(settings):
    settings.PUBLIC_CAMPAIGNS_ENABLED = True
    owner = make_user("race-app-owner")
    project = new_project(owner, "race-apply", "public")
    campaign = approval_campaign(project, slug="race", target=1)
    applications = [
        Application.objects.create(campaign=campaign, applicant=make_user(f"race-app-{n}"))
        for n in range(4)
    ]
    barrier = threading.Barrier(len(applications))
    results: list[str] = []

    def attempt(application) -> None:
        try:
            barrier.wait()
            approve(campaign, owner, application.pk)
            results.append("approved")
        except CampaignError as exc:
            results.append(exc.code)
        finally:
            connection.close()

    threads = [threading.Thread(target=attempt, args=(a,)) for a in applications]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert sorted(results) == ["approved"] + ["campaign_full"] * 3
    assert Participation.objects.filter(campaign=campaign, status="active").count() == 1
