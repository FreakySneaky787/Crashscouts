"""Taking part (WP 3A.4a): join directly, leave, removal by the team, hard limit under load."""

import threading

import pytest
from django.core import mail
from django.db import connection

from apps.audit.models import AuditEvent
from apps.campaigns import status
from apps.campaigns.models import CampaignInvitation, Participation
from apps.campaigns.participation import join
from apps.campaigns.services import CampaignError
from apps.profiles.models import Profile
from apps.projects.tests.test_projects import client_for, make_user, new_project

from .test_campaigns import make_campaign

BASE = "/api/v1/projects/open-app/campaigns/open-beta/"


@pytest.fixture
def setup(db, settings):
    settings.PUBLIC_CAMPAIGNS_ENABLED = True  # direct joining needs a public campaign
    owner = make_user("part-owner")
    maintainer = make_user("part-maint")
    project = new_project(owner, "open-app", "public", [maintainer])
    campaign = make_campaign(
        project, status.PUBLISHED, "public", slug="open-beta", target_testers=2
    )
    return {"owner": owner, "maintainer": maintainer, "project": project, "campaign": campaign}


def act(user, what: str, base: str = BASE):
    return client_for(user).post(f"{base}{what}/")


def test_join_until_full_then_leave_frees_a_place(setup):
    first, second, third = (make_user(f"part-tester-{n}") for n in range(3))
    response = act(first, "join")
    assert response.status_code == 200, response.content
    assert response.json()["is_participant"] is True
    assert act(second, "join").status_code == 200
    assert act(third, "join").json() == {"code": "campaign_full"}
    assert client_for(third).get(BASE).json()["status"] == "full"

    assert act(first, "leave").status_code == 204
    assert client_for(first).get(f"{BASE}links/").status_code == 404  # links gone after leaving
    assert act(third, "join").status_code == 200
    assert act(first, "join").json() == {"code": "campaign_full"}
    kinds = list(AuditEvent.objects.values_list("kind", flat=True))
    assert kinds.count(AuditEvent.Kind.CAMPAIGN_PARTICIPANT_JOINED) == 3
    assert kinds.count(AuditEvent.Kind.CAMPAIGN_PARTICIPANT_LEFT) == 1


def test_rejoining_after_leaving_reuses_the_participation(setup):
    tester = make_user("part-again")
    act(tester, "join")
    act(tester, "leave")
    assert act(tester, "join").status_code == 200
    assert Participation.objects.filter(user=tester).count() == 1


def test_no_double_joining_and_leaving_needs_a_participation(setup):
    tester = make_user("part-double")
    act(tester, "join")
    assert act(tester, "join").json() == {"code": "already_participant"}
    stranger = make_user("part-stranger")
    assert act(stranger, "leave").json() == {"code": "not_participant"}


@pytest.mark.parametrize(
    ("visibility", "participation", "state", "code"),
    [
        ("public", "approval", status.PUBLISHED, "not_direct"),
        ("public", "direct", status.COMPLETED, "campaign_closed"),
        ("public", "direct", status.CANCELLED, "campaign_closed"),
    ],
)
def test_who_can_join_directly(setup, visibility, participation, state, code):
    campaign = make_campaign(setup["project"], state, visibility, slug=f"c-{participation}-{state}")
    campaign.participation = participation
    campaign.save()
    base = f"/api/v1/projects/open-app/campaigns/{campaign.slug}/"
    assert act(make_user("part-who"), "join", base).json() == {"code": code}


def test_private_and_draft_campaigns_cannot_be_joined_by_outsiders(setup):
    private = make_campaign(setup["project"], status.PUBLISHED, "private", slug="private-beta")
    draft = make_campaign(setup["project"], status.DRAFT, "public", slug="draft-beta")
    outsider = make_user("part-outsider")
    for campaign in (private, draft):
        base = f"/api/v1/projects/open-app/campaigns/{campaign.slug}/"
        assert act(outsider, "join", base).status_code == 404  # not even visible
    assert not Participation.objects.exists()


def test_invited_people_join_private_campaigns_only_through_the_invitation(setup):
    private = make_campaign(setup["project"], status.PUBLISHED, "private", slug="private-beta")
    invited = make_user("part-invited")
    client_for(setup["owner"]).post(
        "/api/v1/projects/open-app/campaigns/private-beta/invitations/",
        {"username": "part-invited"},
        format="json",
    )
    base = f"/api/v1/projects/open-app/campaigns/{private.slug}/"
    assert act(invited, "join", base).json() == {"code": "not_direct"}


def test_team_members_and_unconfirmed_accounts_cannot_join(setup):
    assert act(setup["maintainer"], "join").json() == {"code": "team_member"}
    assert act(make_user("part-unconfirmed", verified=False), "join").json() == {
        "code": "email_unconfirmed"
    }
    assert client_for().post(f"{BASE}join/").status_code in {401, 403}


def test_the_team_removes_and_removed_people_stay_out(setup, django_capture_on_commit_callbacks):
    tester = make_user("part-removed")
    act(tester, "join")
    owner = client_for(setup["owner"])
    with django_capture_on_commit_callbacks(execute=True):
        assert owner.delete(f"{BASE}participants/part-removed/").status_code == 204
    assert any("You no longer take part in Campaign" in m.subject for m in mail.outbox)
    assert client_for(tester).get(f"{BASE}links/").status_code == 404
    assert act(tester, "join").json() == {"code": "removed"}
    event = AuditEvent.objects.get(kind=AuditEvent.Kind.CAMPAIGN_PARTICIPANT_REMOVED)
    assert (event.actor, event.subject) == (setup["owner"], tester)
    assert owner.delete(f"{BASE}participants/part-removed/").json() == {"code": "not_participant"}


def test_removed_people_cannot_be_invited_or_accept_again(setup):
    private = make_campaign(setup["project"], status.PUBLISHED, "private", slug="private-beta")
    base = f"/api/v1/projects/open-app/campaigns/{private.slug}/"
    tester = make_user("part-kicked")
    owner = client_for(setup["owner"])
    owner.post(f"{base}invitations/", {"username": "part-kicked"}, format="json")
    invitation = CampaignInvitation.objects.get(invitee=tester)
    client_for(tester).post(f"/api/v1/me/campaign-invitations/{invitation.pk}/accept/")
    # A second, still open invitation would be revoked by the removal.
    assert owner.delete(f"{base}participants/part-kicked/").status_code == 204
    response = owner.post(f"{base}invitations/", {"username": "part-kicked"}, format="json")
    assert response.json() == {"code": "removed"}
    assert client_for(tester).get(base).status_code == 404  # no access any more


def test_only_the_team_removes(setup):
    tester = make_user("part-safe")
    other = make_user("part-other")
    act(tester, "join")
    act(other, "join")
    for user in (other, make_user("part-nobody")):
        assert client_for(user).delete(f"{BASE}participants/part-safe/").status_code == 404
    assert Participation.objects.filter(user=tester, status="active").exists()


def test_the_team_sees_participants_with_public_profile_details_only(setup):
    tester = make_user("part-profiled")
    profile, _ = Profile.objects.get_or_create(user=tester)
    profile.bio = "Tests on old laptops."
    profile.show_bio = False  # hidden: the team must not see it
    profile.show_platforms = True
    profile.save()
    profile.platforms.set([])
    act(tester, "join")
    testers = client_for(setup["owner"]).get(f"{BASE}invitations/").json()
    [entry] = testers["participants"]
    assert entry["username"] == "part-profiled"
    assert "bio" not in entry["profile"]
    # Others only see the number.
    other = make_user("part-curious")
    assert client_for(other).get(f"{BASE}invitations/").status_code == 404
    assert client_for(other).get(BASE).json()["participant_count"] == 1


@pytest.mark.django_db(transaction=True, serialized_rollback=True)
def test_the_limit_holds_when_many_join_at_the_same_time(settings):
    """Real concurrency against PostgreSQL: five joins at once for two places."""
    settings.PUBLIC_CAMPAIGNS_ENABLED = True
    owner = make_user("race-owner")
    project = new_project(owner, "race-app", "public")
    campaign = make_campaign(project, status.PUBLISHED, "public", slug="race", target_testers=2)
    testers = [make_user(f"race-{n}") for n in range(5)]
    barrier = threading.Barrier(len(testers))
    results: list[str] = []

    def attempt(user) -> None:
        try:
            barrier.wait()
            join(campaign, user)
            results.append("joined")
        except CampaignError as exc:
            results.append(exc.code)
        finally:
            connection.close()

    threads = [threading.Thread(target=attempt, args=(user,)) for user in testers]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert sorted(results) == ["campaign_full"] * 3 + ["joined"] * 2
    assert Participation.objects.filter(campaign=campaign, status="active").count() == 2
