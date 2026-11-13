"""Invitations to private campaigns (WP 3A.5): by username, accepted by the invitee, hard limit."""

from datetime import timedelta

import pytest
from django.core import mail
from django.utils import timezone

from apps.audit.models import AuditEvent
from apps.campaigns import status
from apps.campaigns.models import CampaignInvitation, Participation
from apps.projects.tests.test_projects import client_for, make_user, new_project

from .test_campaigns import make_campaign

BASE = "/api/v1/projects/private-app/campaigns/closed-beta/"


@pytest.fixture
def setup(db):
    owner = make_user("inv-owner")
    maintainer = make_user("inv-maint")
    tester = make_user("inv-tester")
    stranger = make_user("inv-stranger")
    project = new_project(owner, "private-app", "public", [maintainer])
    campaign = make_campaign(
        project, status.PUBLISHED, "private", slug="closed-beta", target_testers=2
    )
    return {
        "owner": owner,
        "maintainer": maintainer,
        "tester": tester,
        "stranger": stranger,
        "project": project,
        "campaign": campaign,
    }


def invite(user, username: str, base: str = BASE):
    return client_for(user).post(f"{base}invitations/", {"username": username}, format="json")


def my_invitations(user) -> list[dict]:
    return client_for(user).get("/api/v1/me/campaign-invitations/").json()


def answer(user, invitation_id: str, what: str = "accept"):
    return client_for(user).post(f"/api/v1/me/campaign-invitations/{invitation_id}/{what}/")


def test_invite_accept_and_take_part(setup, django_capture_on_commit_callbacks):
    with django_capture_on_commit_callbacks(execute=True):
        response = invite(setup["maintainer"], "inv-tester")  # the whole team may invite
    assert response.status_code == 201, response.content
    assert any("invited you to test Campaign" in m.subject for m in mail.outbox)

    # Invited: the private campaign becomes visible, the links not yet.
    tester = client_for(setup["tester"])
    assert tester.get(BASE).status_code == 200
    assert tester.get(f"{BASE}links/").status_code == 404
    pending = my_invitations(setup["tester"])
    assert [(i["campaign_title"], i["project_slug"]) for i in pending] == [
        ("Campaign", "private-app")
    ]

    assert answer(setup["tester"], pending[0]["id"]).status_code == 204
    assert tester.get(BASE).json()["participant_count"] == 1
    assert tester.get(f"{BASE}links/").status_code == 200  # participants see the links
    mine = tester.get("/api/v1/me/participations/").json()
    assert [p["campaign_slug"] for p in mine] == ["closed-beta"]
    assert my_invitations(setup["tester"]) == []
    event = AuditEvent.objects.get(kind=AuditEvent.Kind.CAMPAIGN_PARTICIPANT_JOINED)
    assert event.subject == setup["tester"]

    testers = client_for(setup["owner"]).get(f"{BASE}invitations/").json()
    assert [p["username"] for p in testers["participants"]] == ["inv-tester"]
    assert testers["invitations"] == []


def test_declined_and_revoked_invitations_add_nobody(setup):
    invite(setup["owner"], "inv-tester")
    invitation_id = my_invitations(setup["tester"])[0]["id"]
    assert answer(setup["tester"], invitation_id, "decline").status_code == 204
    assert client_for(setup["tester"]).get(BASE).status_code == 404  # no longer invited
    invite(setup["owner"], "inv-tester")
    pending = client_for(setup["owner"]).get(f"{BASE}invitations/").json()["invitations"]
    owner = client_for(setup["owner"])
    assert owner.delete(f"{BASE}invitations/{pending[0]['id']}/").status_code == 204
    assert my_invitations(setup["tester"]) == []
    assert not Participation.objects.exists()


def test_only_the_team_invites_and_sees_the_testers(setup):
    for user in (setup["stranger"], setup["tester"]):
        assert invite(user, "inv-stranger").status_code == 404
        assert client_for(user).get(f"{BASE}invitations/").status_code == 404
    assert client_for().get(f"{BASE}invitations/").status_code in {401, 403}
    # An invited person does not see the team's list either.
    invite(setup["owner"], "inv-tester")
    assert client_for(setup["tester"]).get(f"{BASE}invitations/").status_code == 404


def test_invitations_belong_to_the_invitee_only(setup):
    invite(setup["owner"], "inv-tester")
    invitation_id = my_invitations(setup["tester"])[0]["id"]
    assert answer(setup["stranger"], invitation_id).status_code == 404
    assert answer(setup["tester"], invitation_id, "steal").status_code == 404
    assert not Participation.objects.exists()


@pytest.mark.parametrize(
    ("username", "code"),
    [
        ("nobody-here", "user_not_found"),
        ("inv-unconfirmed", "user_not_found"),
        ("inv-maint", "already_team"),
        ("inv-owner", "already_team"),
    ],
)
def test_who_cannot_be_invited(setup, username, code):
    make_user("inv-unconfirmed", verified=False)
    response = invite(setup["owner"], username)
    assert response.status_code == 400
    assert response.json() == {"code": code}


def test_no_double_invitations_or_participations(setup):
    invite(setup["owner"], "inv-tester")
    assert invite(setup["owner"], "inv-tester").json() == {"code": "already_invited"}
    answer(setup["tester"], my_invitations(setup["tester"])[0]["id"])
    assert invite(setup["owner"], "inv-tester").json() == {"code": "already_participant"}


def test_expired_invitations_neither_count_nor_grant_access(setup):
    invite(setup["owner"], "inv-tester")
    CampaignInvitation.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
    assert my_invitations(setup["tester"]) == []
    assert client_for(setup["tester"]).get(BASE).status_code == 404
    assert invite(setup["owner"], "inv-tester").status_code == 201  # a new one is possible


@pytest.mark.parametrize(
    ("visibility", "state", "code"),
    [
        ("public", status.PUBLISHED, "not_private"),
        ("private", status.DRAFT, "not_published"),
        ("private", status.COMPLETED, "not_published"),
        ("private", status.CANCELLED, "not_published"),
    ],
)
def test_only_running_private_campaigns_take_invitations(setup, settings, visibility, state, code):
    settings.PUBLIC_CAMPAIGNS_ENABLED = True
    campaign = make_campaign(setup["project"], state, visibility, slug=f"c-{visibility}-{state}")
    base = f"/api/v1/projects/private-app/campaigns/{campaign.slug}/"
    assert invite(setup["owner"], "inv-tester", base).json() == {"code": code}


def test_the_limit_is_hard(setup):
    others = [make_user(f"inv-extra-{n}") for n in range(3)]
    for user in others:
        invite(setup["owner"], user.username)
    first, second, third = (my_invitations(u)[0]["id"] for u in others)
    assert answer(others[0], first).status_code == 204
    assert answer(others[1], second).status_code == 204
    response = answer(others[2], third)
    assert response.json() == {"code": "campaign_full"}
    assert Participation.objects.filter(status="active").count() == 2
    # The invitation stays open: the person can join if a place becomes free.
    assert len(my_invitations(others[2])) == 1
    body = client_for(setup["owner"]).get(BASE).json()
    assert (body["status"], body["participant_count"]) == ("full", 2)


def test_closed_campaigns_cannot_be_joined(setup):
    invite(setup["owner"], "inv-tester")
    invitation_id = my_invitations(setup["tester"])[0]["id"]
    setup["campaign"].state = status.COMPLETED
    setup["campaign"].save()
    assert my_invitations(setup["tester"]) == []  # no longer listed
    assert answer(setup["tester"], invitation_id).json() == {"code": "campaign_closed"}
    assert not Participation.objects.exists()


def test_open_invitations_are_capped(setup, monkeypatch):
    monkeypatch.setattr("apps.campaigns.invitations.MAX_PENDING_INVITATIONS", 1)
    invite(setup["owner"], "inv-tester")
    assert invite(setup["owner"], "inv-stranger").json() == {"code": "too_many_invitations"}


def test_inviting_is_rate_limited(setup):
    for number in range(50):
        make_user(f"inv-many-{number}")
    for number in range(50):
        invite(setup["owner"], f"inv-many-{number}")
    assert invite(setup["owner"], "inv-tester").status_code == 429
