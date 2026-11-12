"""Project team (WP 2.3): invitations, accepting, removal, leaving, ownership transfer."""

from datetime import timedelta

import pytest
from django.core import mail
from django.utils import timezone

from apps.accounts.tests.conftest import new_password
from apps.projects.models import Invitation, Membership
from apps.projects.team import MAX_PENDING_INVITATIONS

from .test_projects import client_for, make_user, new_project


@pytest.fixture
def team(db):
    owner = make_user("team-owner")
    maintainer = make_user("team-maint")
    invitee = make_user("team-invitee")
    stranger = make_user("team-stranger")
    project = new_project(owner, "secret-app", "private", [maintainer])
    return {
        "owner": owner,
        "maintainer": maintainer,
        "invitee": invitee,
        "stranger": stranger,
        "project": project,
    }


def invite(client, username: str, slug: str = "secret-app"):
    return client.post(
        f"/api/v1/projects/{slug}/invitations/", {"username": username}, format="json"
    )


def my_invitations(user) -> list[dict]:
    return client_for(user).get("/api/v1/me/invitations/").json()


def test_owner_invites_and_the_invitee_accepts(team):
    response = invite(client_for(team["owner"]), "team-invitee")
    assert response.status_code == 201, response.content
    assert any("invited you to Secret-App" in m.subject for m in mail.outbox)

    # Before accepting, the private project stays invisible to the invitee.
    invitee = client_for(team["invitee"])
    assert invitee.get("/api/v1/projects/secret-app/").status_code == 404
    pending = my_invitations(team["invitee"])
    assert [i["project_name"] for i in pending] == ["Secret-App"]

    assert invitee.post(f"/api/v1/me/invitations/{pending[0]['id']}/accept/").status_code == 204
    assert invitee.get("/api/v1/projects/secret-app/").json()["role"] == "maintainer"
    assert my_invitations(team["invitee"]) == []


def test_declined_invitations_add_nobody(team):
    invite(client_for(team["owner"]), "team-invitee")
    invitation_id = my_invitations(team["invitee"])[0]["id"]
    assert (
        client_for(team["invitee"])
        .post(f"/api/v1/me/invitations/{invitation_id}/decline/")
        .status_code
        == 204
    )
    assert not Membership.objects.filter(user=team["invitee"]).exists()


def test_nobody_else_can_answer_an_invitation(team):
    invite(client_for(team["owner"]), "team-invitee")
    invitation_id = my_invitations(team["invitee"])[0]["id"]
    for user in (team["stranger"], team["owner"], team["maintainer"]):
        assert (
            client_for(user).post(f"/api/v1/me/invitations/{invitation_id}/accept/").status_code
            == 404
        )
    assert client_for().post(f"/api/v1/me/invitations/{invitation_id}/accept/").status_code == 403
    assert not Membership.objects.filter(user=team["invitee"]).exists()


def test_only_the_owner_invites(team):
    assert invite(client_for(team["maintainer"]), "team-invitee").status_code == 403
    assert invite(client_for(team["stranger"]), "team-invitee").status_code == 404  # private
    assert invite(client_for(), "team-invitee").status_code in {401, 403}
    assert not Invitation.objects.exists()


@pytest.mark.parametrize(
    ("username", "code"),
    [
        ("nobody-at-all", "user_not_found"),
        ("team-maint", "already_member"),
        ("team-owner", "already_member"),
    ],
)
def test_invitation_errors(team, username, code):
    response = invite(client_for(team["owner"]), username)
    assert response.status_code == 400
    assert response.json() == {"code": code}


@pytest.mark.django_db
def test_unconfirmed_and_leaving_accounts_count_as_not_found(team):
    make_user("unconfirmed-x", verified=False)
    leaving = make_user("leaving-x")
    leaving.deletion_scheduled_for = timezone.now() + timedelta(days=3)
    leaving.save()
    for username in ("unconfirmed-x", "leaving-x"):
        assert invite(client_for(team["owner"]), username).json() == {"code": "user_not_found"}


def test_no_duplicate_invitations_and_expired_ones_can_be_renewed(team):
    owner = client_for(team["owner"])
    invite(owner, "team-invitee")
    assert invite(owner, "team-invitee").json() == {"code": "already_invited"}

    Invitation.objects.filter(invitee=team["invitee"]).update(
        expires_at=timezone.now() - timedelta(seconds=1)
    )
    assert my_invitations(team["invitee"]) == []  # expired invitations are gone
    expired_id = Invitation.objects.get(invitee=team["invitee"]).pk
    assert (
        client_for(team["invitee"]).post(f"/api/v1/me/invitations/{expired_id}/accept/").status_code
        == 404
    )
    assert invite(owner, "team-invitee").status_code == 201


def test_pending_invitations_are_limited(team):
    owner = client_for(team["owner"])
    for i in range(MAX_PENDING_INVITATIONS):
        assert invite(owner, make_user(f"bulk-{i:02d}").username).status_code == 201
    assert invite(owner, "team-invitee").json() == {"code": "too_many_invitations"}


def test_owner_revokes_an_invitation(team):
    owner = client_for(team["owner"])
    invitation_id = invite(owner, "team-invitee").json()["id"]
    assert (
        client_for(team["maintainer"])
        .delete(f"/api/v1/projects/secret-app/invitations/{invitation_id}/")
        .status_code
        == 403
    )
    assert (
        owner.delete(f"/api/v1/projects/secret-app/invitations/{invitation_id}/").status_code == 204
    )
    assert my_invitations(team["invitee"]) == []


def test_team_view_is_for_the_team_only(team):
    owner_view = client_for(team["owner"]).get("/api/v1/projects/secret-app/team/").json()
    assert [m["username"] for m in owner_view["members"]] == ["team-owner", "team-maint"]
    assert (
        client_for(team["maintainer"]).get("/api/v1/projects/secret-app/team/").status_code == 200
    )
    assert client_for(team["stranger"]).get("/api/v1/projects/secret-app/team/").status_code == 404


def test_removal_and_leaving(team):
    maint = client_for(team["maintainer"])
    # A maintainer cannot remove the owner or others; the owner cannot leave.
    assert maint.delete("/api/v1/projects/secret-app/members/team-owner/").json() == {
        "code": "owner_cannot_leave"
    }
    assert (
        client_for(team["owner"])
        .delete("/api/v1/projects/secret-app/members/team-owner/")
        .status_code
        == 400
    )
    # The maintainer leaves; afterwards the private project is invisible again.
    assert maint.delete("/api/v1/projects/secret-app/members/team-maint/").status_code == 204
    assert maint.get("/api/v1/projects/secret-app/").status_code == 404


def test_owner_removes_a_maintainer(team):
    other = make_user("other-maint")
    Membership.objects.create(project=team["project"], user=other, role=Membership.Role.MAINTAINER)
    assert client_for(team["maintainer"]).delete(
        "/api/v1/projects/secret-app/members/other-maint/"
    ).json() == {"code": "forbidden"}
    assert (
        client_for(team["owner"])
        .delete("/api/v1/projects/secret-app/members/other-maint/")
        .status_code
        == 204
    )
    assert not Membership.objects.filter(user=other).exists()


def test_ownership_transfer_needs_the_password_and_a_maintainer(team):
    owner_user = team["owner"]
    password = new_password()
    owner_user.set_password(password)
    owner_user.save()
    owner = client_for(owner_user)
    url = "/api/v1/projects/secret-app/transfer/"

    assert owner.post(
        url, {"username": "team-maint", "password": "wrong-password"}, format="json"
    ).json() == {"code": "wrong_password"}
    assert owner.post(
        url, {"username": "team-stranger", "password": password}, format="json"
    ).json() == {"code": "not_a_maintainer"}
    assert (
        client_for(team["maintainer"])
        .post(url, {"username": "team-maint", "password": "x"}, format="json")
        .status_code
        == 403
    )

    assert (
        owner.post(url, {"username": "team-maint", "password": password}, format="json").status_code
        == 204
    )
    roles = dict(
        Membership.objects.filter(project=team["project"]).values_list("user__username", "role")
    )
    assert roles == {"team-maint": "owner", "team-owner": "maintainer"}
