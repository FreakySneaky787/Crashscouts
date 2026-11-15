"""Discover (WP 6.2, ADR 0025): only public content, open source preselected, fair sorting,
full-text search with prefixes, filters, paging and a rate limit."""

from datetime import timedelta

import pytest
from django.core.cache import cache
from django.utils import timezone

from apps.campaigns import status
from apps.campaigns.models import Campaign, Participation
from apps.campaigns.tests.test_campaigns import make_campaign
from apps.catalog.models import Category, License, Platform, ProgrammingLanguage, SoftwareType
from apps.projects.models import Project
from apps.projects.tests.test_projects import client_for, make_user, new_project

PROJECTS = "/api/v1/discover/projects/"
CAMPAIGNS = "/api/v1/discover/campaigns/"


def names(response) -> list[str]:
    return [item.get("name") or item.get("title") for item in response.json()["results"]]


def get(url, **params):
    return client_for().get(url, params)


def project(owner, slug, name, *, visibility="public", summary="", description="", **lists):
    created = new_project(owner, slug, visibility)
    Project.objects.filter(pk=created.pk).update(
        name=name, summary=summary or f"{name} summary.", description=description
    )
    created.refresh_from_db()
    for field, model, slugs in (
        ("platforms", Platform, lists.get("platforms", ())),
        ("categories", Category, lists.get("categories", ())),
        ("languages", ProgrammingLanguage, lists.get("languages", ())),
        ("software_types", SoftwareType, lists.get("software_types", ())),
    ):
        getattr(created, field).set(model.objects.filter(slug__in=slugs))
    return created


def age(obj, days: int, **extra) -> None:
    """Sets timestamps directly (auto_now would overwrite them on save)."""
    moment = timezone.now() - timedelta(days=days)
    type(obj).objects.filter(pk=obj.pk).update(created_at=moment, updated_at=moment, **extra)


@pytest.fixture
def world(db, settings):
    settings.PUBLIC_CAMPAIGNS_ENABLED = True
    cache.clear()
    owner = make_user("disc-owner")
    tide = project(
        owner,
        "tidewater",
        "Tidewater Sync",
        description="Synchronises notes between devices.",
        platforms=["linux"],
        categories=["productivity"],
        languages=["rust"],
        software_types=["desktop-app"],
    )
    harbor = project(
        owner,
        "harbor",
        "Harbor",
        summary="A command-line tool for backups.",
        platforms=["windows"],
        software_types=["command-line"],
    )
    closed = project(owner, "closedbox", "Closedbox Sync")
    Project.objects.filter(pk=closed.pk).update(
        license=License.objects.filter(is_osi_approved=False).first()
    )
    hidden = project(owner, "secret-sync", "Secret Sync", visibility="private")
    blocked = project(owner, "blocked-sync", "Blocked Sync")
    Project.objects.filter(pk=blocked.pk).update(blocked_at=timezone.now())
    age(tide, 30)
    age(harbor, 10)
    age(closed, 5)
    return {"owner": owner, "tide": tide, "harbor": harbor, "closed": closed, "hidden": hidden}


# --- Projects -------------------------------------------------------------------------------


def test_only_public_open_source_projects_by_default(world):
    response = get(PROJECTS)
    assert response.status_code == 200
    assert names(response) == ["Harbor", "Tidewater Sync"]  # recently active first
    assert response.json()["total"] == 2
    every = get(PROJECTS, open_source="all")
    assert names(every) == ["Closedbox Sync", "Harbor", "Tidewater Sync"]
    labels = {item["name"]: item["open_source"] for item in every.json()["results"]}
    assert labels == {"Closedbox Sync": False, "Harbor": True, "Tidewater Sync": True}


@pytest.mark.parametrize("term", ["secret", "blocked", "Secret Sync", "sync"])
def test_private_and_blocked_projects_never_appear(world, term):
    found = names(get(PROJECTS, q=term, open_source="all"))
    assert "Secret Sync" not in found
    assert "Blocked Sync" not in found


def test_recently_active_or_new(world):
    # Harbor was created later, but Tidewater changed today: "active" puts it first.
    Project.objects.filter(pk=world["tide"].pk).update(updated_at=timezone.now())
    assert names(get(PROJECTS)) == ["Tidewater Sync", "Harbor"]
    assert names(get(PROJECTS, sort="new")) == ["Harbor", "Tidewater Sync"]
    assert names(get(PROJECTS, sort="popular")) == ["Tidewater Sync", "Harbor"]  # ignored


@pytest.mark.parametrize(
    ("params", "expected"),
    [
        ({"platform": "linux"}, ["Tidewater Sync"]),
        ({"category": "productivity"}, ["Tidewater Sync"]),
        ({"language": "rust"}, ["Tidewater Sync"]),
        ({"software_type": "command-line"}, ["Harbor"]),
        ({"status": "development"}, ["Harbor", "Tidewater Sync"]),
        ({"status": "stable"}, []),
        ({"platform": "linux", "software_type": "command-line"}, []),
        ({"platform": "plan9"}, []),
    ],
)
def test_project_filters(world, params, expected):
    assert names(get(PROJECTS, **params)) == expected


def test_search_with_prefixes_and_weights(world):
    assert names(get(PROJECTS, q="tide")) == ["Tidewater Sync"]
    assert names(get(PROJECTS, q="synchronis")) == ["Tidewater Sync"]  # description, prefix
    assert names(get(PROJECTS, q="BACKUPS")) == ["Harbor"]  # summary, case-insensitive
    assert names(get(PROJECTS, q="tide notes")) == ["Tidewater Sync"]  # every word must match
    assert names(get(PROJECTS, q="tide backups")) == []
    # A name match ranks above a description match.
    project(world["owner"], "notes-app", "Notes", description="tidy")
    project(world["owner"], "other-app", "Other", description="Notes everywhere")
    found = names(get(PROJECTS, q="notes"))
    assert found[0] == "Notes"  # name (weight A) before description matches (weight C)
    assert set(found[1:]) == {"Other", "Tidewater Sync"}


@pytest.mark.parametrize("term", ["':* | !", "a & b", "(", "\\", "x" * 500, "  "])
def test_search_input_never_breaks_the_query(world, term):
    response = get(PROJECTS, q=term)
    assert response.status_code == 200


def test_paging(world):
    for n in range(23):
        project(world["owner"], f"bulk-{n}", f"Bulk {n:02d}")
    first = get(PROJECTS).json()
    assert (len(first["results"]), first["total"], first["page"], first["pages"]) == (20, 25, 1, 2)
    second = get(PROJECTS, page=2).json()
    assert len(second["results"]) == 5
    assert get(PROJECTS, page=99).json()["page"] == 2
    assert get(PROJECTS, page="x").json()["page"] == 1


# --- Campaigns ------------------------------------------------------------------------------


@pytest.fixture
def campaigns(world):
    tide, harbor = world["tide"], world["harbor"]
    live = make_campaign(tide, status.PUBLISHED, "public", slug="open-beta", method="structured")
    live.platforms.set(Platform.objects.filter(slug="linux"))
    Campaign.objects.filter(pk=live.pk).update(title="Open beta of the sync engine")
    full = make_campaign(harbor, status.PUBLISHED, "public", slug="full-beta", target_testers=1)
    Participation.objects.create(campaign=full, user=make_user("disc-tester"))
    Campaign.objects.filter(pk=full.pk).update(title="Harbor backup beta")
    for slug, state, visibility in (
        ("draft", status.DRAFT, "public"),
        ("review", status.IN_REVIEW, "public"),
        ("done", status.COMPLETED, "public"),
        ("private", status.PUBLISHED, "private"),
    ):
        make_campaign(tide, state, visibility, slug=slug)
    blocked = make_campaign(tide, status.PUBLISHED, "public", slug="blocked")
    Campaign.objects.filter(pk=blocked.pk).update(blocked_at=timezone.now())
    make_campaign(world["hidden"], status.PUBLISHED, "public", slug="in-private-project")
    age(live, 3, published_at=timezone.now() - timedelta(days=3))
    age(full, 1, published_at=timezone.now() - timedelta(days=1))
    return {"live": live, "full": full}


def test_only_live_public_campaigns_appear(campaigns):
    response = get(CAMPAIGNS).json()
    assert [c["slug"] for c in response["results"]] == ["full-beta", "open-beta"]
    assert {c["slug"]: c["status"] for c in response["results"]} == {
        "full-beta": "full",
        "open-beta": "open",
    }
    assert response["results"][0]["participants"] == 1


def test_no_campaigns_while_the_gate_is_closed(campaigns, settings):
    settings.PUBLIC_CAMPAIGNS_ENABLED = False
    assert get(CAMPAIGNS).json() == {"results": [], "total": 0, "page": 1, "pages": 1}
    projects = get(PROJECTS).json()["results"]
    assert all(item["active_campaigns"] == 0 for item in projects)


@pytest.mark.parametrize(
    ("params", "expected"),
    [
        ({"method": "structured"}, ["open-beta"]),
        ({"free_places": "1"}, ["open-beta"]),
        ({"platform": "linux"}, ["open-beta"]),
        ({"software_type": "command-line"}, ["full-beta"]),
        ({"q": "harbor"}, ["full-beta"]),  # the project's name counts
        ({"q": "tidewat"}, ["open-beta"]),  # only the project's name matches (WP 8.6)
        ({"q": "sync engine"}, ["open-beta"]),
        ({"q": "draft"}, []),
    ],
)
def test_campaign_filters_and_search(campaigns, params, expected):
    assert [c["slug"] for c in get(CAMPAIGNS, **params).json()["results"]] == expected


def test_projects_count_and_filter_live_campaigns(campaigns):
    items = {i["name"]: i["active_campaigns"] for i in get(PROJECTS).json()["results"]}
    assert items == {"Tidewater Sync": 1, "Harbor": 1}
    Campaign.objects.filter(pk=campaigns["full"].pk).update(state=status.COMPLETED)
    assert names(get(PROJECTS, has_campaign="1")) == ["Tidewater Sync"]


def test_a_new_campaign_makes_its_project_recently_active(campaigns):
    Campaign.objects.filter(pk=campaigns["live"].pk).update(updated_at=timezone.now())
    assert names(get(PROJECTS))[0] == "Tidewater Sync"


# --- Rate limit -----------------------------------------------------------------------------


def test_discover_is_rate_limited_per_ip(world, monkeypatch):
    from rest_framework.throttling import ScopedRateThrottle

    assert ScopedRateThrottle.THROTTLE_RATES["discover_ip"] == "120/min"
    monkeypatch.setitem(ScopedRateThrottle.THROTTLE_RATES, "discover_ip", "2/min")
    cache.clear()
    assert [get(PROJECTS).status_code for _ in range(3)] == [200, 200, 429]
