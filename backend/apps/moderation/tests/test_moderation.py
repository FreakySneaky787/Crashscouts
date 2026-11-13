"""Moderation (WP 3B.3): blocking is enforced everywhere, the queue, warnings, appeals."""

import pytest
from allauth.mfa.models import Authenticator
from django.core import mail

from apps.audit.models import AuditEvent
from apps.campaigns import status
from apps.campaigns.models import CampaignInvitation, CampaignLink, Participation
from apps.moderation.models import Block, ModerationNote, Report
from apps.projects.tests.test_projects import client_for, make_user, new_project

API = "/api/v1/projects/mod-app/"
CAMPAIGN = f"{API}campaigns/beta/"


def make_campaign(project, slug, visibility):
    from apps.campaigns.tests.test_campaigns import make_campaign as make

    return make(project, status.PUBLISHED, visibility, slug=slug, target_testers=10)


def moderator(username: str = "mod-moderator"):
    user = make_user(username)
    Authenticator.objects.create(user=user, type=Authenticator.Type.TOTP, data={"secret": "x"})
    user.platform_role = "moderator"
    user.save()
    return user


@pytest.fixture
def world(db, settings):
    settings.PUBLIC_CAMPAIGNS_ENABLED = True
    owner = make_user("mod-owner")
    project = new_project(owner, "mod-app", "public")
    campaign = make_campaign(project, "beta", "public")
    link = CampaignLink.objects.create(
        campaign=campaign, label="AppImage", url="https://downloads.example.org/app"
    )
    tester = make_user("mod-tester")
    Participation.objects.create(campaign=campaign, user=tester)
    private = make_campaign(project, "private-beta", "private")
    invitee = make_user("mod-invitee")
    client_for(owner).post(
        f"{API}campaigns/private-beta/invitations/", {"username": "mod-invitee"}, format="json"
    )
    return {
        "owner": owner,
        "project": project,
        "campaign": campaign,
        "private": private,
        "link": link,
        "tester": tester,
        "invitee": invitee,
        "stranger": make_user("mod-stranger"),
        "mod": moderator(),
    }


def report(world, user, target_type="project", reason="spam", **extra):
    data = {"target_type": target_type, "project": "mod-app", "reason": reason, **extra}
    response = client_for(user).post("/api/v1/reports/", data, format="json")
    assert response.status_code == 201, response.content


def act(user, target_type, target, action, **data):
    url = f"/api/v1/moderation/cases/{target_type}/{target.pk}/{action}/"
    return client_for(user).post(url, data, format="json")


def visible(user, url: str) -> bool:
    return client_for(user).get(url).status_code == 200


# --- Enforcement --------------------------------------------------------------------------------


def test_blocked_project_disappears_for_everyone_but_the_team(world):
    act(world["mod"], "project", world["project"], "block", category="spam", message="Spam.")
    link_url = f"{CAMPAIGN}links/{world['link'].pk}/"
    for user in (None, world["stranger"], world["tester"], world["invitee"], world["mod"]):
        client = client_for(user)
        assert client.get(API).status_code == 404
        assert client.get(CAMPAIGN).status_code == 404
        assert client.get(f"{API}campaigns/private-beta/").status_code == 404
        assert client.get(link_url).status_code == 404
    owner = client_for(world["owner"])
    body = owner.get(API).json()
    assert body["moderation"]["message"] == "Spam."
    assert body["moderation"]["appeal"] == "none"
    # Links are served to no one, the team included.
    assert owner.get(link_url).status_code == 404
    # Participants lose their list entry; open invitations no longer show.
    assert client_for(world["tester"]).get("/api/v1/me/participations/").json() == []
    assert client_for(world["invitee"]).get("/api/v1/me/campaign-invitations/").json() == []


def test_blocked_campaign_and_link(world):
    act(world["mod"], "campaign", world["campaign"], "block", category="deception", message="No.")
    assert not visible(world["tester"], CAMPAIGN)
    assert visible(world["tester"], API)  # the project itself is still there
    assert visible(world["owner"], CAMPAIGN)
    # Links of a blocked campaign are served to no one, not even the team.
    assert not visible(world["owner"], f"{CAMPAIGN}links/{world['link'].pk}/")
    block = Block.objects.get()
    act(world["mod"], "campaign", world["campaign"], "block", category="spam", message="x")
    assert Block.objects.count() == 1  # one active block per target
    client_for(world["mod"]).post(f"/api/v1/moderation/blocks/{block.pk}/lift/")
    assert visible(world["tester"], CAMPAIGN)

    act(world["mod"], "link", world["link"], "block", category="malware", message="Infected.")
    link_url = f"{CAMPAIGN}links/{world['link'].pk}/"
    assert client_for(world["tester"]).get(f"{CAMPAIGN}links/").json() == []
    assert client_for(world["tester"]).get(link_url).status_code == 404
    assert client_for(world["owner"]).get(link_url).status_code == 404
    team_links = client_for(world["owner"]).get(f"{CAMPAIGN}links/").json()
    assert team_links[0]["blocked"] is True


def test_the_team_cannot_change_blocked_content(world):
    act(world["mod"], "project", world["project"], "block", category="spam", message="Spam.")
    owner = client_for(world["owner"])
    assert owner.patch(API, {"name": "Renamed"}, format="json").json() == {"code": "blocked"}
    assert owner.patch(CAMPAIGN, {"title": "x"}, format="json").json() == {"code": "blocked"}
    assert owner.post(f"{CAMPAIGN}complete/").json() == {"code": "blocked"}
    link = {"label": "x", "url": "https://downloads.example.org/x"}
    assert owner.post(f"{CAMPAIGN}links/", link, format="json").json() == {"code": "blocked"}
    assert owner.post(f"{API}campaigns/", {}, format="json").status_code == 400
    response = owner.post(
        f"{API}campaigns/private-beta/invitations/", {"username": "mod-stranger"}, format="json"
    )
    assert response.json() == {"code": "blocked"}
    # Accepting an existing invitation does not get anyone in either.
    invitation = CampaignInvitation.objects.get(invitee=world["invitee"])
    accept = client_for(world["invitee"]).post(
        f"/api/v1/me/campaign-invitations/{invitation.pk}/accept/"
    )
    assert accept.status_code in {400, 404}
    assert not Participation.objects.filter(user=world["invitee"]).exists()


def test_lifting_restores_everything(world):
    act(world["mod"], "project", world["project"], "block", category="spam", message="Spam.")
    block = Block.objects.get()
    mail.outbox.clear()
    client_for(world["mod"]).post(f"/api/v1/moderation/blocks/{block.pk}/lift/")
    assert visible(world["stranger"], API)
    assert visible(world["tester"], f"{CAMPAIGN}links/{world['link'].pk}/")
    assert AuditEvent.objects.filter(kind=AuditEvent.Kind.UNBLOCKED).exists()


# --- Queue and actions ---------------------------------------------------------------------------


def test_only_moderators_use_the_moderation_api(world):
    report(world, world["tester"])
    for user in (world["stranger"], world["owner"], world["tester"]):
        client = client_for(user)
        assert client.get("/api/v1/moderation/cases/").status_code == 404
        assert (
            act(
                user, "project", world["project"], "block", category="spam", message="x"
            ).status_code
            == 404
        )
        assert client.get("/api/v1/moderation/appeals/").status_code == 404
    no_2fa = make_user("mod-no2fa")
    no_2fa.platform_role = "moderator"
    no_2fa.save()
    assert client_for(no_2fa).get("/api/v1/moderation/cases/").status_code == 404
    assert world["project"].__class__.objects.get(pk=world["project"].pk).blocked_at is None


def test_queue_puts_malware_first_and_shows_the_details(world):
    report(world, world["tester"], "project", "spam", text="Looks like spam")
    report(world, world["tester"], "link", "malware", campaign="beta", link=str(world["link"].pk))
    cases = client_for(world["mod"]).get("/api/v1/moderation/cases/").json()
    assert [c["target_type"] for c in cases] == ["link", "project"]
    assert cases[0]["malware"] is True
    assert cases[0]["url"] == "https://downloads.example.org/app"
    detail = (
        client_for(world["mod"])
        .get(f"/api/v1/moderation/cases/project/{world['project'].pk}/")
        .json()
    )
    assert detail["reports"][0]["text"] == "Looks like spam"
    assert detail["reports"][0]["reporter"] == "mod-tester"
    assert act(world["mod"], "project", world["project"], "take").status_code == 204
    assert Report.objects.get(target_type="project").status == "in_review"


def test_blocking_closes_reports_and_emails_team_and_reporters(
    world, django_capture_on_commit_callbacks
):
    report(world, world["tester"], text="Spam everywhere")
    with django_capture_on_commit_callbacks(execute=True):
        act(world["mod"], "project", world["project"], "block", category="spam", message="Spam.")
    assert Report.objects.get().status == "resolved"
    subjects = [m.subject for m in mail.outbox]
    assert any("Moderators blocked content of Mod-App" in s for s in subjects)
    assert any("Your report was reviewed" in s for s in subjects)
    reporter_mail = next(m for m in mail.outbox if "Your report was reviewed" in m.subject)
    assert "Spam." not in reporter_mail.body  # no details about the other side
    # The reporter's free text never reaches the audit log.
    assert all("Spam everywhere" not in str(e.data) for e in AuditEvent.objects.all())


def test_warning_and_dismissal(world, django_capture_on_commit_callbacks):
    report(world, world["tester"])
    with django_capture_on_commit_callbacks(execute=True):
        act(world["mod"], "project", world["project"], "warn", message="Please fix the summary.")
    assert ModerationNote.objects.get().text == "Please fix the summary."
    assert any("A warning from the moderators" in m.subject for m in mail.outbox)
    assert visible(world["stranger"], API)  # a warning blocks nothing
    report(world, world["stranger"])
    assert act(world["mod"], "project", world["project"], "dismiss").status_code == 204
    assert set(Report.objects.values_list("status", flat=True)) == {"resolved", "dismissed"}
    assert act(world["mod"], "project", world["project"], "dismiss").json() == {
        "code": "nothing_open"
    }
    # Earlier warnings are visible to moderators in the case.
    detail = (
        client_for(world["mod"])
        .get(f"/api/v1/moderation/cases/project/{world['project'].pk}/")
        .json()
    )
    assert detail["notes"][0]["text"] == "Please fix the summary."


def test_lifting_a_suspension(world):
    others = [make_user(f"mod-rep-{n}") for n in range(3)]
    for user in others:
        Participation.objects.create(campaign=world["campaign"], user=user)
        report(world, user, "link", "malware", campaign="beta", link=str(world["link"].pk))
    world["link"].refresh_from_db()
    assert world["link"].suspended_at is not None
    assert act(world["mod"], "link", world["link"], "lift-suspension").status_code == 204
    assert visible(world["tester"], f"{CAMPAIGN}links/{world['link'].pk}/")
    assert set(Report.objects.values_list("status", flat=True)) == {"dismissed"}


def test_block_validation(world):
    assert act(world["mod"], "project", world["project"], "block", category="spam").json() == {
        "code": "message_required"
    }
    assert act(world["mod"], "project", world["project"], "explode").status_code == 404


# --- Appeals -------------------------------------------------------------------------------------


def test_the_team_appeals_once_and_moderators_decide(world, django_capture_on_commit_callbacks):
    act(world["mod"], "project", world["project"], "block", category="spam", message="Spam.")
    block = Block.objects.get()
    url = f"/api/v1/blocks/{block.pk}/appeal/"
    assert client_for(world["stranger"]).post(url, {"text": "Mine!"}).status_code == 404
    assert client_for(world["tester"]).post(url, {"text": "Mine!"}).status_code == 404
    owner = client_for(world["owner"])
    assert owner.post(url, {"text": ""}, format="json").json() == {"code": "message_required"}
    assert owner.post(url, {"text": "It is our own project."}, format="json").status_code == 204
    assert owner.post(url, {"text": "Again"}, format="json").json() == {"code": "already_appealed"}
    assert owner.get(API).json()["moderation"]["appeal"] == "pending"

    appeals = client_for(world["mod"]).get("/api/v1/moderation/appeals/").json()
    assert appeals[0]["appeal_text"] == "It is our own project."
    decide = f"/api/v1/moderation/appeals/{block.pk}/"
    with django_capture_on_commit_callbacks(execute=True):
        assert client_for(world["mod"]).post(f"{decide}lift/").status_code == 204
    assert visible(world["stranger"], API)
    assert any("Your appeal for Mod-App was decided" in m.subject for m in mail.outbox)
    assert client_for(world["mod"]).post(f"{decide}uphold/").json() == {"code": "no_open_appeal"}


def test_upheld_appeals_keep_the_block(world):
    act(world["mod"], "campaign", world["campaign"], "block", category="legal", message="Copied.")
    block = Block.objects.get()
    client_for(world["owner"]).post(
        f"/api/v1/blocks/{block.pk}/appeal/", {"text": "Not copied."}, format="json"
    )
    client_for(world["mod"]).post(f"/api/v1/moderation/appeals/{block.pk}/uphold/")
    assert not visible(world["tester"], CAMPAIGN)
    campaign = client_for(world["owner"]).get(CAMPAIGN).json()
    assert campaign["moderation"]["appeal"] == "upheld"
