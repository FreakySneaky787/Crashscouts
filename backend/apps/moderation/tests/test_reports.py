"""Reporting (WP 3B.2): who may report what, limits, and the automatic link suspension."""

import pytest
from django.core import mail

from apps.accounts.lifecycle import export_data
from apps.audit.models import AuditEvent
from apps.campaigns import status
from apps.campaigns.models import Campaign, CampaignLink, Participation
from apps.moderation.models import Report
from apps.projects.tests.test_projects import client_for, make_user, new_project

URL = "/api/v1/reports/"
LINKS = "/api/v1/projects/rep-app/campaigns/beta/links/"


def make_campaign(project, slug, visibility, state=status.PUBLISHED):
    from apps.campaigns.tests.test_campaigns import make_campaign as make

    return make(project, state, visibility, slug=slug, target_testers=10)


@pytest.fixture
def world(db, settings):
    settings.PUBLIC_CAMPAIGNS_ENABLED = True
    owner = make_user("rep-owner")
    project = new_project(owner, "rep-app", "public")
    campaign = make_campaign(project, "beta", "public")
    link = CampaignLink.objects.create(
        campaign=campaign, label="AppImage", url="https://downloads.example.org/app"
    )
    return {"owner": owner, "project": project, "campaign": campaign, "link": link}


def participant(world, username: str):
    user = make_user(username)
    Participation.objects.create(campaign=world["campaign"], user=user)
    return user


def send(user, target_type="project", reason="spam", **target):
    data = {"target_type": target_type, "project": "rep-app", "reason": reason, **target}
    return client_for(user).post(URL, data, format="json")


def report_link(user, world, reason="malware"):
    return send(user, "link", reason, campaign="beta", link=str(world["link"].pk))


def test_reporting_each_kind_of_content(world):
    tester = participant(world, "rep-tester")
    assert send(tester, "project", "spam", text=" Looks like spam. ").status_code == 201
    assert send(tester, "campaign", "deception", campaign="beta").status_code == 201
    assert report_link(tester, world, "legal").status_code == 201
    mine = client_for(tester).get("/api/v1/me/reports/").json()
    assert sorted(r["target_type"] for r in mine) == ["campaign", "link", "project"]
    assert {r["status"] for r in mine} == {"open"}
    assert Report.objects.get(target_type="project").text == "Looks like spam."
    # The audit log has no free text.
    events = AuditEvent.objects.filter(kind=AuditEvent.Kind.REPORTED)
    assert events.count() == 3
    assert all("text" not in e.data and "spam." not in str(e.data) for e in events)


def test_nobody_reports_what_they_cannot_see(world):
    stranger = make_user("rep-stranger")
    hidden = new_project(world["owner"], "hidden-app", "private")
    make_campaign(hidden, "secret", "private")
    make_campaign(world["project"], "private-beta", "private")
    data = {"target_type": "project", "project": "hidden-app", "reason": "spam"}
    assert client_for(stranger).post(URL, data, format="json").status_code == 404
    assert send(stranger, "campaign", campaign="private-beta").status_code == 404
    assert send(stranger, "campaign", campaign="no-such-campaign").status_code == 404
    # Links: only the team and participants see them, so only they can report them.
    assert report_link(stranger, world).status_code == 404
    assert not Report.objects.exists()


def test_invited_people_can_report_private_campaigns(world):
    private = make_campaign(world["project"], "private-beta", "private")
    invited = make_user("rep-invited")
    client_for(world["owner"]).post(
        f"/api/v1/projects/rep-app/campaigns/{private.slug}/invitations/",
        {"username": "rep-invited"},
        format="json",
    )
    assert send(invited, "campaign", "deception", campaign="private-beta").status_code == 201


def test_rules_for_reporting(world):
    tester = participant(world, "rep-rules")
    assert send(tester).status_code == 201
    assert send(tester).json() == {"code": "already_reported"}  # one open report per content
    assert send(tester, reason="nonsense").json() == {"reason": ["invalid_choice"]}
    assert send(tester, "campaign", campaign="beta", text="x" * 1001).json() == {
        "text": ["max_length"]
    }
    unconfirmed = make_user("rep-unconfirmed", verified=False)
    response = send(unconfirmed)
    assert response.status_code == 403
    assert response.json() == {"code": "email_unconfirmed"}
    assert client_for().post(URL, {}, format="json").status_code in {401, 403}


def test_reports_are_rate_limited(world):
    tester = make_user("rep-many")
    projects = [new_project(world["owner"], f"many-{n}", "public") for n in range(21)]
    for project in projects[:20]:
        data = {"target_type": "project", "project": project.slug, "reason": "spam"}
        assert client_for(tester).post(URL, data, format="json").status_code == 201
    data = {"target_type": "project", "project": projects[20].slug, "reason": "spam"}
    assert client_for(tester).post(URL, data, format="json").status_code == 429


def test_three_accounts_reporting_malware_suspend_the_link(
    world, django_capture_on_commit_callbacks
):
    reporters = [participant(world, f"rep-mal-{n}") for n in range(3)]
    viewer = participant(world, "rep-viewer")
    link_url = f"{LINKS}{world['link'].pk}/"
    assert report_link(reporters[0], world).status_code == 201
    assert report_link(reporters[1], world).status_code == 201
    world["link"].refresh_from_db()
    assert world["link"].suspended_at is None  # two are not enough
    with django_capture_on_commit_callbacks(execute=True):
        assert report_link(reporters[2], world).status_code == 201
    world["link"].refresh_from_db()
    assert world["link"].suspended_at is not None
    assert any("was suspended" in m.subject for m in mail.outbox)
    assert AuditEvent.objects.filter(kind=AuditEvent.Kind.LINK_SUSPENDED).count() == 1
    # Served to no one: participants do not get it, the warning page is 404 even for the team.
    assert client_for(viewer).get(LINKS).json() == []
    assert client_for(viewer).get(link_url).status_code == 404
    assert client_for(world["owner"]).get(link_url).status_code == 404
    team_list = client_for(world["owner"]).get(LINKS).json()
    assert [(link["label"], link["suspended"]) for link in team_list] == [("AppImage", True)]
    # The team cannot quietly change or remove it while it is under review.
    owner = client_for(world["owner"])
    assert owner.patch(link_url, {"label": "x"}, format="json").json() == {"code": "link_suspended"}
    assert owner.delete(link_url).json() == {"code": "link_suspended"}
    # Nobody can report it any more (it is not served).
    assert report_link(viewer, world).status_code == 404


def test_other_reasons_and_repeated_reports_do_not_suspend(world):
    reporters = [participant(world, f"rep-other-{n}") for n in range(3)]
    for user in reporters:
        report_link(user, world, "spam")
    world["link"].refresh_from_db()
    assert world["link"].suspended_at is None
    # One account cannot reach the threshold alone (one open report per content).
    lone = participant(world, "rep-lone")
    report_link(lone, world)
    assert report_link(lone, world).json() == {"code": "already_reported"}
    world["link"].refresh_from_db()
    assert world["link"].suspended_at is None


def test_reports_survive_deleted_content_and_appear_in_the_export(world):
    tester = participant(world, "rep-export")
    send(tester, "campaign", "deception", campaign="beta", text="Fake installer")
    Campaign.objects.filter(pk=world["campaign"].pk).delete()
    kept = Report.objects.get()
    assert kept.campaign is None
    assert "Campaign" in kept.target_label
    [exported] = export_data(tester)["reports"]
    assert (exported["reason"], exported["text"]) == ("deception", "Fake installer")
