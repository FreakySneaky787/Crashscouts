"""Download links (WP 3A.3): team and participants only, strict URL rules, repository hint."""

import pytest
from django.utils import timezone

from apps.audit.models import AuditEvent
from apps.campaigns import status
from apps.campaigns.models import CampaignLink
from apps.projects.models import RepositoryVerification
from apps.projects.tests.test_projects import client_for, make_user, new_project

from .test_campaigns import make_campaign

SHA = "a" * 64


@pytest.fixture
def team(db, settings):
    settings.PUBLIC_CAMPAIGNS_ENABLED = True  # so a public campaign is visible to strangers
    owner = make_user("link-owner")
    maintainer = make_user("link-maint")
    stranger = make_user("link-stranger")
    project = new_project(owner, "linked-app", "public", [maintainer])
    campaign = make_campaign(project, status.PUBLISHED, "public", slug="beta")
    return {
        "owner": owner,
        "maintainer": maintainer,
        "stranger": stranger,
        "project": project,
        "campaign": campaign,
    }


URL = "/api/v1/projects/linked-app/campaigns/beta/links/"


def add(user, **overrides):
    data = {"label": "Linux AppImage", "url": "https://downloads.example.org/app-2.0.AppImage"}
    data.update(overrides)
    return client_for(user).post(URL, data, format="json")


def test_the_team_adds_links_and_sees_them(team):
    response = add(team["maintainer"], platform="linux", sha256=f"  {SHA.upper()} ")
    assert response.status_code == 201, response.content
    body = response.json()
    assert body["host"] == "downloads.example.org"
    assert body["sha256"] == SHA  # normalised
    assert body["platform"]["slug"] == "linux"
    assert body["in_repository"] is False
    listed = client_for(team["owner"]).get(URL).json()
    assert [link["label"] for link in listed] == ["Linux AppImage"]
    event = AuditEvent.objects.get(kind=AuditEvent.Kind.CAMPAIGN_LINK_ADDED)
    assert event.data["host"] == "downloads.example.org"


def test_links_are_hidden_from_everyone_outside_team_and_participants(team):
    link_id = add(team["owner"]).json()["id"]
    campaign_url = "/api/v1/projects/linked-app/campaigns/beta/"
    for client in (client_for(team["stranger"]), client_for()):
        assert client.get(campaign_url).status_code == 200  # the public campaign itself is visible
        assert client.get(URL).status_code == 404
        assert client.get(f"{URL}{link_id}/").status_code == 404
        assert client.post(
            URL, {"label": "x", "url": "https://evil.example.org/x"}
        ).status_code in {404}
        assert client.delete(f"{URL}{link_id}/").status_code == 404
    assert CampaignLink.objects.count() == 1


def test_links_of_hidden_campaigns_are_404(team, settings):
    add(team["owner"])
    settings.PUBLIC_CAMPAIGNS_ENABLED = False  # gate closed again: campaign hidden
    assert client_for(team["stranger"]).get(URL).status_code == 404
    assert client_for(team["owner"]).get(URL).status_code == 200


@pytest.mark.parametrize(
    "url",
    [
        "http://downloads.example.org/app",  # not https
        "https://user:secret@downloads.example.org/app",  # credentials
        "https://127.0.0.1/app",
        "https://[::1]/app",
        "https://10.0.0.5/app",
        "https://localhost/app",
        "https://intranet/app",  # no dot
        "https://nas.local/app",
        "https://build.internal/app",
        "https://downloads.example.org:8443/app",  # unusual port
        "https://d\u043ewnloads.example.org/app",  # Cyrillic small o (a look-alike host)
        "https://downloads.example.org/app file",  # whitespace
        "javascript:alert(1)",
        "ftp://downloads.example.org/app",
        "https://" + "a" * 500 + ".org/",
        "",
    ],
)
def test_unsafe_links_are_rejected(team, url):
    response = add(team["owner"], url=url)
    assert response.status_code == 400
    assert response.json()["url"][0] in {"invalid_download_url", "blank", "max_length"}


@pytest.mark.parametrize("sha", ["xyz", "a" * 63, "a" * 65, "g" * 64])
def test_bad_checksums_are_rejected(team, sha):
    assert add(team["owner"], sha256=sha).json() == {"sha256": ["invalid_sha256"]}


def test_at_most_ten_links_per_campaign(team):
    for number in range(CampaignLink.MAX_PER_CAMPAIGN):
        assert add(team["owner"], label=f"Build {number}").status_code == 201
    assert add(team["owner"], label="One more").json() == {"code": "too_many_links"}


def test_links_of_closed_campaigns_cannot_change(team):
    link_id = add(team["owner"]).json()["id"]
    team["campaign"].state = status.COMPLETED
    team["campaign"].save()
    owner = client_for(team["owner"])
    assert add(team["owner"]).json() == {"code": "campaign_closed"}
    assert owner.delete(f"{URL}{link_id}/").json() == {"code": "campaign_closed"}
    assert owner.get(URL).status_code == 200  # still visible


def test_links_are_changed_and_removed_with_audit(team):
    link_id = add(team["owner"]).json()["id"]
    owner = client_for(team["owner"])
    response = owner.patch(f"{URL}{link_id}/", {"label": "AppImage (x86_64)"}, format="json")
    assert response.json()["label"] == "AppImage (x86_64)"
    assert owner.delete(f"{URL}{link_id}/").status_code == 204
    kinds = list(
        AuditEvent.objects.filter(kind__startswith="campaign.link").values_list("kind", flat=True)
    )
    assert sorted(kinds) == [
        "campaign.link_added",
        "campaign.link_changed",
        "campaign.link_removed",
    ]


def test_links_of_another_campaign_are_404(team):
    other = make_campaign(team["project"], status.PUBLISHED, "public", slug="other")
    link_id = add(team["owner"]).json()["id"]
    response = client_for(team["owner"]).get(
        f"/api/v1/projects/linked-app/campaigns/{other.slug}/links/{link_id}/"
    )
    assert response.status_code == 404


def verify(project, url: str) -> None:
    project.repository_url = url
    project.save()
    RepositoryVerification.objects.create(
        project=project, repository_url=url, code="x", method="file", verified_at=timezone.now()
    )


@pytest.mark.parametrize(
    ("link", "inside"),
    [
        ("https://github.com/Octo/App/releases/download/v2/app.AppImage", True),
        ("https://github.com/octo/app", True),  # the repository page itself
        ("https://github.com/octo/app-evil/releases/download/v2/app", False),
        ("https://github.com/octo/other/releases/download/v2/app", False),
        ("https://github.com.evil.org/octo/app/releases/x", False),
        ("https://downloads.example.org/octo/app/x", False),
    ],
)
def test_links_into_the_verified_repository_are_marked(team, link, inside):
    verify(team["project"], "https://github.com/octo/app")
    assert add(team["owner"], url=link).json()["in_repository"] is inside


def test_no_repository_mark_without_verification(team):
    team["project"].repository_url = "https://github.com/octo/app"
    team["project"].save()
    url = "https://github.com/octo/app/releases/download/v2/app"
    assert add(team["owner"], url=url).json()["in_repository"] is False


def test_participants_see_links_but_cannot_change_them(team, monkeypatch):
    """Participants arrive in WP 3A.4; simulated here so the team-only write check is covered."""
    link_id = add(team["owner"]).json()["id"]
    monkeypatch.setattr(
        "apps.campaigns.policies.is_participant", lambda user, campaign: user == team["stranger"]
    )
    participant = client_for(team["stranger"])
    assert participant.get(URL).status_code == 200
    assert participant.get(f"{URL}{link_id}/").status_code == 200
    assert add(team["stranger"]).status_code == 403
    assert participant.patch(f"{URL}{link_id}/", {"label": "x"}, format="json").status_code == 403
    assert participant.delete(f"{URL}{link_id}/").status_code == 403
    assert CampaignLink.objects.get().label == "Linux AppImage"
