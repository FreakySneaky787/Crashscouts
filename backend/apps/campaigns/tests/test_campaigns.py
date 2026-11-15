"""Campaigns (WP 3A.1): permissions, the public-campaign lock, status, short names, validation."""

from datetime import timedelta

import pytest
from allauth.mfa.models import Authenticator
from django.utils import timezone

from apps.audit.models import AuditEvent
from apps.campaigns import status
from apps.campaigns.models import Campaign
from apps.projects.tests.test_projects import client_for, make_user, new_project

NOW = timezone.now()


def payload(**overrides) -> dict:
    data = {
        "slug": "beta-1",
        "title": "Beta 1",
        "summary": "Try the new sync engine.",
        "description": "## What is new\n\n- Faster sync",
        "version": "2.0.0-beta.1",
        "changelog": "- New sync engine",
        "hardware_requirements": "4 GB RAM",
        "prerequisites": "A free account.",
        "methodology": "Free testing.",
        "starts_at": (NOW + timedelta(days=7)).isoformat(),
        "ends_at": (NOW + timedelta(days=21)).isoformat(),
        "target_testers": 20,
        "platforms": ["linux"],
    }
    data.update(overrides)
    return data


def base(project_slug: str = "tidewater") -> str:
    return f"/api/v1/projects/{project_slug}/campaigns/"


@pytest.fixture
def people(db):
    return {
        "owner": make_user("camp-owner"),
        "maintainer": make_user("camp-maint"),
        "stranger": make_user("camp-stranger"),
    }


@pytest.fixture
def project(people):
    return new_project(people["owner"], "tidewater", "public", [people["maintainer"]])


def create(user, project_slug: str = "tidewater", **overrides):
    return client_for(user).post(base(project_slug), payload(**overrides), format="json")


def make_campaign(project, state: str = status.DRAFT, visibility: str = "private", **fields):
    campaign = Campaign.objects.create(
        project=project,
        slug=fields.pop("slug", f"{state}-{visibility}"),
        title="Campaign",
        summary="A campaign.",
        version="1.0",
        starts_at=fields.pop("starts_at", NOW + timedelta(days=1)),
        ends_at=fields.pop("ends_at", NOW + timedelta(days=10)),
        target_testers=fields.pop("target_testers", 10),
        visibility=visibility,
        participation="invitation" if visibility == "private" else "direct",
        state=state,
        **fields,
    )
    return campaign


# --- Creating -------------------------------------------------------------------------------


@pytest.mark.parametrize("who", ["owner", "maintainer"])
def test_the_team_creates_private_drafts(people, project, who):
    response = create(people[who])
    assert response.status_code == 201, response.content
    body = response.json()
    assert body["state"] == body["status"] == "draft"
    assert body["visibility"] == "private"
    assert body["participation"] == "invitation"
    assert body["project"] == "tidewater"
    assert body["can_edit"] is True
    assert [p["slug"] for p in body["platforms"]] == ["linux"]
    assert AuditEvent.objects.filter(kind=AuditEvent.Kind.CAMPAIGN_CREATED).count() == 1


def test_outsiders_cannot_create(people, project):
    assert create(people["stranger"]).status_code == 403  # public project, not the team
    assert client_for().post(base(), payload(), format="json").status_code in {401, 403, 404}
    private = new_project(people["owner"], "hidden", "private")
    assert create(people["stranger"], private.slug).status_code == 404
    assert Campaign.objects.count() == 0


def test_unconfirmed_team_members_cannot_create(people, project):
    unconfirmed = make_user("camp-unconfirmed", verified=False)
    project.memberships.create(user=unconfirmed, role="maintainer")
    response = create(unconfirmed)
    assert response.status_code == 403
    assert response.json() == {"code": "email_unconfirmed"}


@pytest.mark.parametrize(
    ("overrides", "field", "code"),
    [
        ({"ends_at": (NOW + timedelta(days=1)).isoformat()}, "ends_at", "ends_before_start"),
        ({"target_testers": 0}, "target_testers", "min_value"),
        ({"target_testers": 1001}, "target_testers", "max_value"),
        ({"slug": "Bad Name"}, "slug", "invalid_slug"),
        ({"slug": "new"}, "slug", "reserved_slug"),
        ({"title": ""}, "title", "blank"),
        ({"version": ""}, "version", "blank"),
        ({"platforms": ["no-such-platform"]}, "platforms", "does_not_exist"),
        (
            {"visibility": "private", "participation": "direct"},
            "participation",
            "participation_mismatch",
        ),
        (
            {"visibility": "public", "participation": "invitation"},
            "participation",
            "participation_mismatch",
        ),
        ({"description": "x" * 10_001}, "description", "max_length"),
    ],
)
def test_invalid_input_is_rejected_with_codes(people, project, overrides, field, code):
    response = create(people["owner"], **overrides)
    assert response.status_code == 400
    assert code in response.json()[field]


def test_public_campaigns_default_to_direct_participation(people, project):
    body = create(people["owner"], visibility="public").json()
    assert (body["visibility"], body["participation"]) == ("public", "direct")
    body = create(people["owner"], slug="beta-2", visibility="public", participation="approval")
    assert body.json()["participation"] == "approval"


def test_short_names_are_unique_per_project(people, project):
    assert create(people["owner"]).status_code == 201
    response = create(people["owner"])
    assert response.json() == {"slug": ["slug_taken"]}
    new_project(people["owner"], "other-app", "public")
    assert create(people["owner"], "other-app").status_code == 201  # same name, other project


def test_campaign_creation_is_rate_limited(people, project):
    for number in range(20):
        assert create(people["owner"], slug=f"run-{number}").status_code == 201
    assert create(people["owner"], slug="one-more").status_code == 429


# --- Seeing ---------------------------------------------------------------------------------

MATRIX = [
    # (visibility, state, flag, project visibility) -> visible for strangers and anonymous
    ("private", status.DRAFT, False, "public", False),
    ("private", status.PUBLISHED, False, "public", False),  # invited people only (WP 3A.5)
    ("public", status.DRAFT, False, "public", False),
    ("public", status.DRAFT, True, "public", False),
    ("public", status.PUBLISHED, False, "public", False),  # gate closed: hidden again
    ("public", status.PUBLISHED, True, "public", True),
    ("public", status.PUBLISHED, True, "private", False),
    ("public", status.COMPLETED, True, "public", True),
]


@pytest.mark.parametrize(("visibility", "state", "flag", "project_visibility", "visible"), MATRIX)
def test_permission_matrix(people, settings, visibility, state, flag, project_visibility, visible):
    settings.PUBLIC_CAMPAIGNS_ENABLED = flag
    project = new_project(people["owner"], "matrix-app", project_visibility, [people["maintainer"]])
    campaign = make_campaign(project, state, visibility)
    url = f"{base('matrix-app')}{campaign.slug}/"
    for who in ("owner", "maintainer"):
        response = client_for(people[who]).get(url)
        assert response.status_code == 200
        assert response.json()["can_edit"] is True
    for client in (client_for(people["stranger"]), client_for()):
        expected = 200 if visible else 404
        assert client.get(url).status_code == expected
        listed = client.get(base("matrix-app"))
        slugs = [c["slug"] for c in listed.json()] if listed.status_code == 200 else []
        assert (campaign.slug in slugs) is visible
        assert client.patch(url, {"title": "Taken over"}, format="json").status_code in {
            401,
            403,
            404,
        }


def test_unknown_and_malformed_names_are_404(people, project):
    owner = client_for(people["owner"])
    assert owner.get(f"{base()}does-not-exist/").status_code == 404
    assert owner.get(f"{base()}..%2F/").status_code == 404
    assert owner.get(f"{base('no-such-project')}beta-1/").status_code == 404


# --- Changing -------------------------------------------------------------------------------


def test_renaming_keeps_the_old_name_working(people, project):
    create(people["owner"])
    owner = client_for(people["owner"])
    response = owner.patch(f"{base()}beta-1/", {"slug": "beta-one"}, format="json")
    assert response.status_code == 200
    assert owner.get(f"{base()}beta-1/").json()["slug"] == "beta-one"
    # The old name stays reserved within the project.
    assert create(people["owner"]).json() == {"slug": ["slug_taken"]}


def test_strangers_cannot_change_or_delete(people, project, settings):
    settings.PUBLIC_CAMPAIGNS_ENABLED = True
    campaign = make_campaign(project, status.PUBLISHED, "public")
    stranger = client_for(people["stranger"])
    url = f"{base()}{campaign.slug}/"
    assert stranger.patch(url, {"title": "Taken over"}, format="json").status_code == 403
    assert stranger.delete(url).status_code == 403
    assert stranger.post(f"{url}cancel/").status_code == 403
    campaign.refresh_from_db()
    assert (campaign.title, campaign.state) == ("Campaign", status.PUBLISHED)


def test_who_may_take_part_is_frozen_after_publishing(people, project):
    campaign = make_campaign(project, status.PUBLISHED, "private")
    owner = client_for(people["owner"])
    url = f"{base()}{campaign.slug}/"
    response = owner.patch(url, {"visibility": "public"}, format="json")
    assert response.json() == {"code": "locked_after_publish"}
    assert owner.patch(url, {"title": "Renamed"}, format="json").status_code == 200


@pytest.mark.parametrize("state", [status.COMPLETED, status.CANCELLED])
def test_closed_campaigns_are_read_only(people, project, state):
    campaign = make_campaign(project, state)
    response = client_for(people["owner"]).patch(
        f"{base()}{campaign.slug}/", {"title": "Again"}, format="json"
    )
    assert response.json() == {"code": "campaign_closed"}


def test_only_drafts_can_be_deleted(people, project):
    draft = make_campaign(project, status.DRAFT)
    published = make_campaign(project, status.PUBLISHED)
    owner = client_for(people["maintainer"])
    assert owner.delete(f"{base()}{published.slug}/").json() == {"code": "not_a_draft"}
    assert owner.delete(f"{base()}{draft.slug}/").status_code == 204
    assert not Campaign.objects.filter(pk=draft.pk).exists()


# --- State changes and the public-campaign lock ----------------------------------------------


def act(user, campaign, action: str):
    return client_for(user).post(f"{base(campaign.project.slug)}{campaign.slug}/{action}/")


def test_private_campaigns_are_published_completed_and_cancelled(people, project):
    campaign = make_campaign(project)
    assert act(people["maintainer"], campaign, "publish").json()["state"] == "published"
    assert act(people["owner"], campaign, "complete").json()["status"] == "completed"
    assert act(people["owner"], campaign, "cancel").json() == {"code": "invalid_transition"}
    kinds = set(AuditEvent.objects.values_list("kind", flat=True))
    assert {AuditEvent.Kind.CAMPAIGN_PUBLISHED, AuditEvent.Kind.CAMPAIGN_COMPLETED} <= kinds


@pytest.mark.parametrize(
    ("start", "action", "allowed"),
    [
        (status.DRAFT, "publish", True),
        (status.DRAFT, "cancel", True),
        (status.DRAFT, "complete", False),
        (status.PUBLISHED, "publish", False),
        (status.PUBLISHED, "complete", True),
        (status.PUBLISHED, "cancel", True),
        (status.COMPLETED, "cancel", False),
        (status.CANCELLED, "publish", False),
    ],
)
def test_state_transitions(people, project, start, action, allowed):
    campaign = make_campaign(project, start)
    response = act(people["owner"], campaign, action)
    assert (response.status_code == 200) is allowed
    if not allowed:
        assert response.json() == {"code": "invalid_transition"}


def test_unknown_actions_are_404(people, project):
    campaign = make_campaign(project)
    assert act(people["owner"], campaign, "delete-everything").status_code == 404


def test_public_campaigns_cannot_be_published_while_locked(people, project, settings):
    settings.PUBLIC_CAMPAIGNS_ENABLED = False
    campaign = make_campaign(project, status.DRAFT, "public")
    response = act(people["owner"], campaign, "publish")
    assert response.status_code == 403
    assert response.json() == {"code": "public_campaigns_locked"}
    campaign.refresh_from_db()
    assert campaign.state == status.DRAFT
    assert not AuditEvent.objects.filter(kind=AuditEvent.Kind.CAMPAIGN_PUBLISHED).exists()


def test_public_campaigns_need_a_public_project_once_unlocked(people, settings):
    settings.PUBLIC_CAMPAIGNS_ENABLED = True
    private_project = new_project(people["owner"], "secret-app", "private")
    campaign = make_campaign(private_project, status.DRAFT, "public")
    assert act(people["owner"], campaign, "publish").json() == {"code": "project_not_public"}
    public_project = new_project(people["owner"], "open-app", "public")
    campaign = make_campaign(public_project, status.DRAFT, "public")
    # Rule A: submitting needs 2FA; then the campaign waits for review (WP 3B.4).
    assert act(people["owner"], campaign, "publish").json() == {"code": "needs_2fa"}
    Authenticator.objects.create(
        user=people["owner"], type=Authenticator.Type.TOTP, data={"secret": "x"}
    )
    assert act(people["owner"], campaign, "publish").json()["state"] == "in_review"


def test_the_lock_is_off_by_default():
    from django.conf import settings

    assert settings.PUBLIC_CAMPAIGNS_ENABLED is False


# --- Derived status -------------------------------------------------------------------------


def test_status_follows_start_date(people, project):
    campaign = make_campaign(
        project,
        status.PUBLISHED,
        starts_at=NOW - timedelta(minutes=1),
        ends_at=NOW + timedelta(days=3),
    )
    body = client_for(people["owner"]).get(f"{base()}{campaign.slug}/").json()
    assert body["status"] == "in_progress"
    assert body["participant_count"] == 0


@pytest.mark.parametrize(
    ("state", "start_offset", "participants", "target", "expected"),
    [
        (status.DRAFT, -1, 0, 5, "draft"),
        (status.PUBLISHED, 1, 0, 5, "open"),
        (status.PUBLISHED, 1, 4, 5, "open"),
        (status.PUBLISHED, 1, 5, 5, "full"),
        (status.PUBLISHED, 0, 0, 5, "in_progress"),  # exactly at the start
        (status.PUBLISHED, -1, 5, 5, "in_progress"),
        (status.COMPLETED, -1, 5, 5, "completed"),
        (status.CANCELLED, 1, 0, 5, "cancelled"),
    ],
)
def test_effective_status(state, start_offset, participants, target, expected):
    starts_at = NOW + timedelta(hours=start_offset)
    result = status.effective_status(
        state, starts_at=starts_at, now=NOW, participants=participants, target=target
    )
    assert result == expected


@pytest.mark.parametrize(
    ("state", "participants", "accepts"),
    [
        (status.DRAFT, 0, False),
        (status.PUBLISHED, 4, True),
        (status.PUBLISHED, 5, False),  # hard limit
        (status.COMPLETED, 0, False),
        (status.CANCELLED, 0, False),
    ],
)
def test_accepts_participants(state, participants, accepts):
    assert status.accepts_participants(state, participants=participants, target=5) is accepts


def test_policy_alone_hides_public_campaigns_of_private_projects(people, settings):
    """Defence in depth: the API already hides private projects; the policy must not rely on it."""
    from apps.campaigns.policies import can_view

    settings.PUBLIC_CAMPAIGNS_ENABLED = True
    project = new_project(people["owner"], "turned-private", "public")
    campaign = make_campaign(project, status.PUBLISHED, "public")
    assert can_view(people["stranger"], campaign) is True
    project.visibility = "private"
    project.save()
    campaign.refresh_from_db()
    assert can_view(people["stranger"], campaign) is False
    assert can_view(people["owner"], campaign) is True


def test_time_zone_is_stored_and_validated(people, project):
    body = create(people["owner"]).json()
    assert body["timezone"] == "Europe/Zurich"  # default
    body = create(people["owner"], slug="beta-ny", timezone="America/New_York").json()
    assert body["timezone"] == "America/New_York"
    for bad in ("Mars/Olympus", "../../etc/passwd", ""):
        response = create(people["owner"], slug="beta-bad", timezone=bad)
        assert response.status_code == 400
        assert response.json()["timezone"][0] in {"invalid_timezone", "blank"}


@pytest.mark.django_db
def test_the_campaign_list_decides_the_team_once(settings):
    """WP 8.6: the list looked up the viewer's membership five times per campaign."""
    from django.db import connection
    from django.test.utils import CaptureQueriesContext

    settings.PUBLIC_CAMPAIGNS_ENABLED = True
    owner, stranger = make_user("list-owner"), make_user("list-stranger")
    project = new_project(owner, "list-app", "public")
    make_campaign(project, status.PUBLISHED, "public", slug="one")

    def membership_lookups(user) -> tuple[list, int]:
        with CaptureQueriesContext(connection) as captured:
            items = client_for(user).get(base("list-app")).json()
        return items, sum("projects_membership" in q["sql"] for q in captured)

    _, few = membership_lookups(owner)
    for index in range(3):
        make_campaign(project, status.PUBLISHED, "public", slug=f"more-{index}")
    make_campaign(project, status.DRAFT, "public", slug="draft")
    items, many = membership_lookups(owner)
    assert many == few
    assert len(items) == 5
    assert all(item["can_edit"] and item["new_feedback"] == 0 for item in items)
    seen = client_for(stranger).get(base("list-app")).json()
    assert sorted(item["slug"] for item in seen) == ["more-0", "more-1", "more-2", "one"]
    assert not any(item["can_edit"] for item in seen)
    assert all(item["new_feedback"] is None and item["open_applications"] is None for item in seen)
