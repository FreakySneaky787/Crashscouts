"""Campaign data in the account lifecycle (WP 3A.6): export, grace period, final deletion."""

import pytest

from apps.accounts.lifecycle import export_data, request_deletion
from apps.campaigns import status
from apps.campaigns.models import (
    Application,
    ApplicationAnswer,
    Campaign,
    CampaignInvitation,
    Participation,
)
from apps.projects.models import Membership
from apps.projects.tests.test_projects import client_for, make_user, new_project, schedule_and_purge

from .test_campaigns import make_campaign
from .test_invitations import my_invitations


@pytest.fixture
def world(db, settings):
    settings.PUBLIC_CAMPAIGNS_ENABLED = True
    owner = make_user("life-owner")
    maintainer = make_user("life-maint")
    tester = make_user("life-tester")
    other = make_user("life-other")
    project = new_project(owner, "life-app", "public", [maintainer])
    private = make_campaign(project, status.DRAFT, "private", slug="private-beta", target_testers=2)
    client_for(maintainer).post("/api/v1/projects/life-app/campaigns/private-beta/publish/")
    approval = make_campaign(project, status.PUBLISHED, "public", slug="open-beta")
    approval.participation = Campaign.Participation.APPROVAL
    approval.save()
    question = approval.questions.create(prompt="Device?", kind="short_text", required=True)
    return {
        "owner": owner,
        "maintainer": maintainer,
        "tester": tester,
        "other": other,
        "project": project,
        "private": Campaign.objects.get(pk=private.pk),
        "approval": approval,
        "question": question,
    }


def join_private(world, user) -> None:
    client_for(world["owner"]).post(
        "/api/v1/projects/life-app/campaigns/private-beta/invitations/",
        {"username": user.username},
        format="json",
    )
    invitation_id = my_invitations(user)[0]["id"]
    client_for(user).post(f"/api/v1/me/campaign-invitations/{invitation_id}/accept/")


def apply_open(world, user, device: str) -> None:
    response = client_for(user).post(
        "/api/v1/projects/life-app/campaigns/open-beta/apply/",
        {"answers": {str(world["question"].pk): device}},
        format="json",
    )
    assert response.status_code == 201, response.content


def test_export_contains_own_campaign_data_only(world):
    join_private(world, world["tester"])
    apply_open(world, world["tester"], "Old laptop")
    apply_open(world, world["other"], "Someone else's phone")
    data = export_data(world["tester"])
    assert [p["campaign"] for p in data["campaign_participations"]] == ["private-beta"]
    assert [i["status"] for i in data["campaign_invitations"]] == ["accepted"]
    [application] = data["campaign_applications"]
    assert application["answers"] == [{"question": "Device?", "answer": "Old laptop"}]
    assert "Someone else's phone" not in str(data)
    assert data["campaigns_published"] == []
    published = export_data(world["maintainer"])["campaigns_published"]
    assert [c["campaign"] for c in published] == ["private-beta"]


def test_grace_period_keeps_the_place_but_hides_the_person(world):
    join_private(world, world["tester"])
    apply_open(world, world["other"], "Tablet")
    request_deletion(world["tester"])
    request_deletion(world["other"])
    owner = client_for(world["owner"])
    testers = owner.get("/api/v1/projects/life-app/campaigns/private-beta/invitations/").json()
    assert testers["participants"] == []  # not listed by name
    campaign = owner.get("/api/v1/projects/life-app/campaigns/private-beta/").json()
    assert campaign["participant_count"] == 1  # but still holds the place
    applications = owner.get("/api/v1/projects/life-app/campaigns/open-beta/applications/").json()
    assert applications == []
    assert Participation.objects.filter(user=world["tester"], status="active").exists()


def test_final_deletion_frees_the_place_and_removes_campaign_data(world):
    join_private(world, world["tester"])
    apply_open(world, world["tester"], "Old laptop")
    schedule_and_purge(world["tester"])
    assert not Participation.objects.exists()
    assert not CampaignInvitation.objects.exists()
    assert not Application.objects.exists()
    assert not ApplicationAnswer.objects.exists()
    owner = client_for(world["owner"])
    campaign = owner.get("/api/v1/projects/life-app/campaigns/private-beta/").json()
    assert campaign["participant_count"] == 0


def test_deleting_team_members_keeps_campaigns_and_clears_references(world):
    apply_open(world, world["tester"], "Phone")
    application_id = Application.objects.get().pk
    client_for(world["maintainer"]).post(
        f"/api/v1/projects/life-app/campaigns/open-beta/applications/{application_id}/reject/"
    )
    schedule_and_purge(world["maintainer"])
    private = Campaign.objects.get(slug="private-beta")
    assert private.published_by is None  # the publishing account is gone
    assert private.published_at is not None  # the campaign still counts for the metrics
    assert Application.objects.get().decided_by is None


def test_campaigns_follow_their_project_when_the_owner_is_deleted(world):
    schedule_and_purge(world["owner"])
    # The project went to the maintainer; its campaigns are still there.
    assert Membership.objects.get(project=world["project"]).user == world["maintainer"]
    assert Campaign.objects.filter(project=world["project"]).count() == 2
