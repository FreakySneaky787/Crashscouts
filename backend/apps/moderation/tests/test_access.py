"""Several moderators and purpose-bound access (WP 7.3, ADR 0028): taking a case, access to the
content of the reported object only after taking it, with a reason, for 24 hours, audited;
admins see every access."""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.audit.models import AuditEvent
from apps.campaigns import status
from apps.campaigns.models import CampaignLink, Participation
from apps.campaigns.tests.test_campaigns import make_campaign
from apps.moderation.models import ModeratorAccess
from apps.projects.tests.test_projects import client_for, make_user, new_project

from .test_moderation import moderator

SECRET_TEXT = "Internal notes for invited testers only"


@pytest.fixture
def scene(db):
    owner = make_user("acc-owner")
    project = new_project(owner, "acc-app", "public")
    campaign = make_campaign(
        project, status.PUBLISHED, "private", slug="closed-beta", description=SECRET_TEXT
    )
    CampaignLink.objects.create(
        campaign=campaign, label="Installer", url="https://downloads.example.org/setup.exe"
    )
    tester = make_user("acc-tester")
    Participation.objects.create(campaign=campaign, user=tester)
    data = {
        "target_type": "campaign",
        "project": "acc-app",
        "campaign": "closed-beta",
        "reason": "malware",
    }
    assert client_for(tester).post("/api/v1/reports/", data, format="json").status_code == 201
    return {"campaign": campaign, "mod": moderator("acc-mod"), "mod2": moderator("acc-mod-2")}


def case_url(scene, action=""):
    base = f"/api/v1/moderation/cases/campaign/{scene['campaign'].pk}/"
    return f"{base}{action}/" if action else base


def take(scene, mod):
    assert client_for(mod).post(case_url(scene, "take"), {}, format="json").status_code == 204


def open_access(scene, mod, reason="Malware report: check the download links."):
    return client_for(mod).post(case_url(scene, "access"), {"reason": reason}, format="json")


def test_taking_a_case_shows_who_and_can_be_taken_over(scene):
    take(scene, scene["mod"])
    cases = client_for(scene["mod2"]).get("/api/v1/moderation/cases/").json()
    assert [c["taken_by"] for c in cases] == ["acc-mod"]
    take(scene, scene["mod2"])  # several moderators: another one takes it over
    assert client_for(scene["mod"]).get(case_url(scene)).json()["taken_by"] == "acc-mod-2"
    actors = list(
        AuditEvent.objects.filter(kind=AuditEvent.Kind.CASE_TAKEN).values_list(
            "actor__username", flat=True
        )
    )
    assert sorted(actors) == ["acc-mod", "acc-mod-2"]


def test_without_access_moderators_see_the_reports_and_the_title_only(scene):
    take(scene, scene["mod"])
    case = client_for(scene["mod"]).get(case_url(scene))
    assert case.json()["title"] == scene["campaign"].title
    assert SECRET_TEXT not in case.content.decode()
    assert case.json()["access"] is None


def test_rules_for_opening_access(scene):
    assert open_access(scene, scene["mod"]).json() == {"code": "take_first"}
    take(scene, scene["mod"])
    assert open_access(scene, scene["mod2"]).json() == {"code": "take_first"}  # not their case
    assert open_access(scene, scene["mod"], " ").json() == {"code": "reason_required"}
    too_long = client_for(scene["mod"]).post(
        case_url(scene, "access"), {"reason": "x" * 501}, format="json"
    )
    assert too_long.status_code == 400
    for user in (scene["campaign"].project.memberships.first().user, None):
        assert open_access(scene, user).status_code in {401, 403, 404}
    assert not ModeratorAccess.objects.exists()
    person = make_user("acc-person")
    url = f"/api/v1/moderation/cases/user/{person.pk}/access/"
    response = client_for(scene["mod"]).post(url, {"reason": "x"}, format="json")
    assert response.json() == {"code": "not_supported"}


def test_access_shows_the_content_for_24_hours_and_is_audited(scene):
    take(scene, scene["mod"])
    assert open_access(scene, scene["mod"]).status_code == 204
    assert open_access(scene, scene["mod"]).status_code == 204  # the same access again
    found = ModeratorAccess.objects.get()
    assert abs(found.expires_at - found.created_at - timedelta(hours=24)) < timedelta(seconds=1)
    own = client_for(scene["mod"]).get(case_url(scene)).json()["access"]
    assert own["id"] == str(found.pk)
    url = f"/api/v1/moderation/accesses/{found.pk}/"
    body = client_for(scene["mod"]).get(url).json()
    assert body["content"]["description"] == SECRET_TEXT
    assert body["content"]["links"] == [
        {"label": "Installer", "url": "https://downloads.example.org/setup.exe"}
    ]
    assert body["reason"] == "Malware report: check the download links."
    # Only the moderator who opened it, only while it is valid.
    for user in (scene["mod2"], make_user("acc-stranger"), None):
        assert client_for(user).get(url).status_code in {401, 403, 404}
    kinds = list(AuditEvent.objects.values_list("kind", flat=True))
    assert kinds.count(AuditEvent.Kind.MODERATOR_ACCESS_GRANTED) == 1
    assert kinds.count(AuditEvent.Kind.MODERATOR_ACCESS_USED) == 1
    ModeratorAccess.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
    assert client_for(scene["mod"]).get(url).status_code == 404
    assert client_for(scene["mod"]).get(case_url(scene)).json()["access"] is None


def test_admins_see_every_access(scene):
    take(scene, scene["mod"])
    assert open_access(scene, scene["mod"]).status_code == 204
    found = ModeratorAccess.objects.get()
    client_for(scene["mod"]).get(f"/api/v1/moderation/accesses/{found.pk}/")
    assert client_for(scene["mod"]).get("/api/v1/moderation/accesses/").status_code == 404
    admin = moderator("acc-admin")
    admin.platform_role = "admin"
    admin.save()
    [listed] = client_for(admin).get("/api/v1/moderation/accesses/").json()
    assert (listed["moderator"], listed["views"], listed["active"]) == ("acc-mod", 1, True)
    assert listed["target_label"].startswith(scene["campaign"].title)
    # Admins do not read the content through someone else's access either.
    assert client_for(admin).get(f"/api/v1/moderation/accesses/{found.pk}/").status_code == 404
