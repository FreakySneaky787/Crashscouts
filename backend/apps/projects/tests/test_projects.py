"""Projects (WP 2.2a): permissions matrix, short names, creation rules, handover on deletion."""

from datetime import timedelta

import pytest
from allauth.account.models import EmailAddress
from django.contrib.auth import get_user_model
from django.core import mail
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.lifecycle import purge_due_accounts
from apps.accounts.tests.conftest import new_password
from apps.catalog.models import License
from apps.projects.models import Membership, Project, SlugHistory
from apps.projects.services import create_project

User = get_user_model()


def make_user(username: str, verified: bool = True):
    user = User.objects.create_user(
        username=username, email=f"{username}@example.test", password=new_password()
    )
    EmailAddress.objects.create(user=user, email=user.email, verified=verified, primary=True)
    return user


def client_for(user=None) -> APIClient:
    client = APIClient()
    if user is not None:
        client.force_authenticate(user)
    return client


def new_project(owner, slug: str, visibility: str = "public", maintainers=()):
    project = create_project(
        owner,
        slug=slug,
        name=slug.title(),
        summary="A test project.",
        visibility=visibility,
        license=License.objects.get(spdx_id="MIT"),
    )
    for maintainer in maintainers:
        Membership.objects.create(project=project, user=maintainer, role=Membership.Role.MAINTAINER)
    return project


@pytest.fixture
def people(db):
    return {
        "owner": make_user("owner-user"),
        "maintainer": make_user("maintainer-user"),
        "stranger": make_user("stranger-user"),
        "anonymous": None,
    }


@pytest.fixture
def projects(people):
    return {
        visibility: new_project(
            people["owner"], f"{visibility}-app", visibility, [people["maintainer"]]
        )
        for visibility in ("public", "private")
    }


# Expected HTTP status per (who, visibility, action). Private projects are invisible (404) to
# everyone outside the team, so even their existence stays secret.
MATRIX = {
    ("anonymous", "public"): {"view": 200, "edit": 403, "delete": 403},
    ("anonymous", "private"): {"view": 404, "edit": 404, "delete": 404},
    ("stranger", "public"): {"view": 200, "edit": 403, "delete": 403},
    ("stranger", "private"): {"view": 404, "edit": 404, "delete": 404},
    ("maintainer", "public"): {"view": 200, "edit": 200, "delete": 403},
    ("maintainer", "private"): {"view": 200, "edit": 200, "delete": 403},
    ("owner", "public"): {"view": 200, "edit": 200, "delete": 204},
    ("owner", "private"): {"view": 200, "edit": 200, "delete": 204},
}


@pytest.mark.parametrize(("who", "visibility"), list(MATRIX))
def test_permission_matrix(people, projects, who, visibility):
    project = projects[visibility]
    client = client_for(people[who])
    url = f"/api/v1/projects/{project.slug}/"
    expected = MATRIX[(who, visibility)]

    assert client.get(url).status_code == expected["view"]
    assert client.patch(url, {"summary": "Changed."}, format="json").status_code == expected["edit"]
    assert client.delete(url).status_code == expected["delete"]
    assert Project.objects.filter(pk=project.pk).exists() == (expected["delete"] != 204)


def test_private_project_is_invisible_also_under_a_former_name(people, projects):
    private = projects["private"]
    client_for(people["owner"]).patch(
        f"/api/v1/projects/{private.slug}/", {"slug": "renamed-private"}, format="json"
    )
    assert client_for(people["stranger"]).get("/api/v1/projects/private-app/").status_code == 404
    assert client_for().get("/api/v1/projects/renamed-private/").status_code == 404


def test_viewer_role_and_team_are_reported(people, projects):
    data = client_for(people["maintainer"]).get("/api/v1/projects/public-app/").json()
    assert data["role"] == "maintainer"
    assert [(m["username"], m["role"]) for m in data["team"]] == [
        ("owner-user", "owner"),
        ("maintainer-user", "maintainer"),
    ]
    assert client_for().get("/api/v1/projects/public-app/").json()["role"] is None


def test_open_source_label_follows_the_licence(people):
    project = new_project(people["owner"], "busl-app")
    project.license = License.objects.get(spdx_id="BUSL-1.1")
    project.save()
    data = client_for().get("/api/v1/projects/busl-app/").json()
    assert data["open_source"] is False
    assert data["license"]["spdx_id"] == "BUSL-1.1"


# --- Creating ----------------------------------------------------------------------------


def create_payload(**overrides) -> dict:
    return {
        "slug": "new-app",
        "name": "New App",
        "summary": "Sync notes between devices.",
        "description": "## Features\n\n- Offline first",
        "status": "beta",
        "visibility": "public",
        "license": "AGPL-3.0-only",
        "repository_url": "https://example.test/new-app",
        "platforms": ["linux", "android"],
        "languages": ["rust"],
        **overrides,
    }


def test_confirmed_users_can_create_and_become_owner(people):
    response = client_for(people["stranger"]).post(
        "/api/v1/projects/", create_payload(), format="json"
    )

    assert response.status_code == 201, response.content
    project = Project.objects.get(slug="new-app")
    assert Membership.objects.get(project=project).user == people["stranger"]
    assert response.json()["role"] == "owner"
    assert response.json()["open_source"] is True


@pytest.mark.django_db
def test_unconfirmed_and_anonymous_users_cannot_create():
    unconfirmed = make_user("unconfirmed-user", verified=False)
    assert (
        client_for(unconfirmed)
        .post("/api/v1/projects/", create_payload(), format="json")
        .status_code
        == 403
    )
    assert (
        client_for().post("/api/v1/projects/", create_payload(), format="json").status_code == 403
    )
    assert not Project.objects.exists()


def test_new_projects_default_to_private(people):
    payload = create_payload()
    del payload["visibility"]
    client_for(people["stranger"]).post("/api/v1/projects/", payload, format="json")
    assert Project.objects.get(slug="new-app").visibility == "private"


@pytest.mark.parametrize(
    ("overrides", "field"),
    [
        ({"slug": "ab"}, "slug"),
        ({"slug": "Has Space"}, "slug"),
        ({"slug": "-start"}, "slug"),
        ({"slug": "double--hyphen"}, "slug"),
        ({"slug": "new"}, "slug"),
        ({"license": "Not-A-License"}, "license"),
        ({"repository_url": "http://example.test/repo"}, "repository_url"),
        ({"repository_url": "javascript:alert(1)"}, "repository_url"),
        ({"description": "x" * 10_001}, "description"),
        ({"platforms": ["plan9"]}, "platforms"),
        ({"status": "released"}, "status"),
    ],
)
def test_invalid_input_is_rejected(people, overrides, field):
    response = client_for(people["stranger"]).post(
        "/api/v1/projects/", create_payload(**overrides), format="json"
    )
    assert response.status_code == 400
    assert field in response.json()


def test_short_names_are_unique_including_former_names(people, projects):
    client = client_for(people["stranger"])
    assert (
        client.post(
            "/api/v1/projects/", create_payload(slug="public-app"), format="json"
        ).status_code
        == 400
    )
    client_for(people["owner"]).patch(
        "/api/v1/projects/public-app/", {"slug": "public-app-2"}, format="json"
    )
    # The former name stays reserved for the project (it keeps redirecting).
    assert (
        client.post(
            "/api/v1/projects/", create_payload(slug="public-app"), format="json"
        ).status_code
        == 400
    )


def test_renaming_keeps_the_old_name_working(people, projects):
    owner = client_for(people["owner"])
    owner.patch("/api/v1/projects/public-app/", {"slug": "better-name"}, format="json")

    old = client_for().get("/api/v1/projects/public-app/")
    assert old.status_code == 200
    assert old.json()["slug"] == "better-name"
    assert SlugHistory.objects.filter(slug="public-app").exists()

    # Renaming back frees the history entry again.
    owner.patch("/api/v1/projects/better-name/", {"slug": "public-app"}, format="json")
    assert not SlugHistory.objects.filter(slug="public-app").exists()
    assert client_for().get("/api/v1/projects/better-name/").json()["slug"] == "public-app"


def test_project_creation_is_rate_limited(people):
    client = client_for(people["stranger"])
    statuses = [
        client.post(
            "/api/v1/projects/", create_payload(slug=f"app-{i:02d}"), format="json"
        ).status_code
        for i in range(11)
    ]
    assert statuses[:10] == [201] * 10
    assert statuses[10] == 429


def test_my_projects_lists_only_own_projects(people, projects):
    new_project(people["stranger"], "stranger-app")
    slugs = {p["slug"] for p in client_for(people["maintainer"]).get("/api/v1/me/projects/").json()}
    assert slugs == {"public-app", "private-app"}
    assert client_for().get("/api/v1/me/projects/").status_code == 403


# --- Owner deletes the account -------------------------------------------------------------


def schedule_and_purge(user) -> None:
    user.deletion_scheduled_for = timezone.now() - timedelta(minutes=1)
    user.save()
    purge_due_accounts()


def test_projects_go_to_the_longest_serving_maintainer(people, projects):
    later = make_user("later-maintainer")
    Membership.objects.create(
        project=projects["public"], user=later, role=Membership.Role.MAINTAINER
    )

    schedule_and_purge(people["owner"])

    owner = Membership.objects.get(project=projects["public"], role=Membership.Role.OWNER)
    assert owner.user == people["maintainer"]
    assert Membership.objects.filter(project=projects["public"]).count() == 2
    assert any("You are now the owner" in m.subject for m in mail.outbox)


def test_projects_without_maintainers_are_deleted_with_the_owner(people):
    alone = new_project(people["stranger"], "lonely-app")

    schedule_and_purge(people["stranger"])

    assert not Project.objects.filter(pk=alone.pk).exists()


def test_deletion_email_names_owned_projects(people, projects):
    from apps.accounts.lifecycle import request_deletion

    request_deletion(people["owner"])
    body = next(m.body for m in mail.outbox if "will be deleted" in m.subject)
    assert "Public-App" in body
    assert "Private-App" in body
