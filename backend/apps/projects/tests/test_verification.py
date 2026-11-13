"""Repository verification (WP 2.5) against simulated code hosts: no network, no credentials."""

import json
import logging
from urllib.parse import parse_qs, urlsplit

import pytest
import requests

from apps.accounts.tests.conftest import new_password
from apps.audit.models import AuditEvent
from apps.projects.models import RepositoryVerification
from apps.projects.repositories import verification_filename
from apps.projects.verification import ATTEMPTS_PER_HOUR, MAX_FILE_BYTES

from .test_projects import client_for, make_user, new_project

ALLOWED_PREFIXES = (
    "https://api.github.com/",
    "https://gitlab.com/api/v4/",
    "https://codeberg.org/api/v1/",
    "https://github.com/login/oauth/access_token",
)
CALLBACK = "/api/v1/repository-verification/github/callback/"


class FakeResponse:
    def __init__(self, status: int = 200, body: bytes | str | dict | list = b"") -> None:
        self.status_code = status
        if isinstance(body, dict | list):
            body = json.dumps(body)
        self.body = body.encode() if isinstance(body, str) else body

    def iter_content(self, chunk_size: int):
        for start in range(0, len(self.body), chunk_size):
            yield self.body[start : start + chunk_size]

    def __enter__(self):
        return self

    def __exit__(self, *exc) -> bool:
        return False


class FakeHosts:
    """Answers per (method, URL); records every call and its options."""

    def __init__(self) -> None:
        self.routes: dict[tuple[str, str], FakeResponse | Exception] = {}
        self.calls: list[dict] = []

    def add(self, method: str, url: str, response) -> None:
        self.routes[(method, url)] = response

    def __call__(self, method, url, **kwargs):
        self.calls.append({"method": method, "url": url, **kwargs})
        assert kwargs.get("allow_redirects") is False, "redirects must never be followed"
        assert kwargs.get("timeout") == 5
        answer = self.routes.get((method, url), FakeResponse(404, {"message": "Not Found"}))
        if isinstance(answer, Exception):
            raise answer
        return answer

    def urls(self) -> list[str]:
        return [call["url"] for call in self.calls]


@pytest.fixture
def hosts(monkeypatch):
    fake = FakeHosts()
    monkeypatch.setattr("apps.projects.verification.requests.request", fake)
    return fake


@pytest.fixture
def team(db):
    owner = make_user("verify-owner")
    maintainer = make_user("verify-maint")
    stranger = make_user("verify-stranger")
    project = new_project(owner, "verified-app", "public", [maintainer])
    return {"owner": owner, "maintainer": maintainer, "stranger": stranger, "project": project}


REPOS = {
    "github": (
        "https://github.com/octo/app",
        "https://api.github.com/repos/octo/app",
        "https://api.github.com/repos/octo/app/contents/{file}",
        {"private": False},
    ),
    "gitlab": (
        "https://gitlab.com/group/sub/app",
        "https://gitlab.com/api/v4/projects/group%2Fsub%2Fapp",
        "https://gitlab.com/api/v4/projects/group%2Fsub%2Fapp/repository/files/{file}/raw?ref=HEAD",
        {"visibility": "public"},
    ),
    "codeberg": (
        "https://codeberg.org/someone/app",
        "https://codeberg.org/api/v1/repos/someone/app",
        "https://codeberg.org/api/v1/repos/someone/app/raw/{file}",
        {"private": False},
    ),
}


def link(project, url: str) -> None:
    response = client_for(project.memberships.get(role="owner").user).patch(
        f"/api/v1/projects/{project.slug}/", {"repository_url": url}, format="json"
    )
    assert response.status_code == 200, response.content


def status_of(user, slug: str = "verified-app"):
    return client_for(user).get(f"/api/v1/projects/{slug}/verification/")


def check(user, slug: str = "verified-app"):
    return client_for(user).post(f"/api/v1/projects/{slug}/verification/file/")


def serve_repo(hosts, kind: str, info: dict | None = None, file_body=None) -> None:
    _, repo_api, file_api, public = REPOS[kind]
    hosts.add("GET", repo_api, FakeResponse(200, info if info is not None else public))
    if file_body is not None:
        hosts.add("GET", file_api.format(file=verification_filename()), file_body)


# --- Check file ------------------------------------------------------------------------------


@pytest.mark.parametrize("kind", sorted(REPOS))
def test_check_file_verifies_on_every_supported_host(team, hosts, kind):
    link(team["project"], REPOS[kind][0])
    state = status_of(team["maintainer"]).json()
    assert state["verified"] is False
    assert state["host"] == kind
    assert state["filename"] == verification_filename()
    serve_repo(hosts, kind, file_body=FakeResponse(200, f"﻿{state['code']}\n"))

    response = check(team["maintainer"])
    assert response.status_code == 200, response.content
    assert response.json()["verified"] is True
    assert response.json()["method"] == "file"
    assert all(url.startswith(ALLOWED_PREFIXES) for url in hosts.urls())
    public = client_for().get("/api/v1/projects/verified-app/").json()
    assert public["verification_method"] == "file"
    event = AuditEvent.objects.filter(kind=AuditEvent.Kind.PROJECT_VERIFIED).get()
    assert event.data == {"project": str(team["project"].pk), "method": "file"}


@pytest.mark.parametrize(
    ("file_response", "code"),
    [
        (FakeResponse(200, "not-the-code"), "code_mismatch"),
        (FakeResponse(404, {"message": "Not Found"}), "file_missing"),
        (FakeResponse(200, b"x" * (MAX_FILE_BYTES + 1)), "response_too_large"),
        (FakeResponse(301, b""), "repository_moved"),
        (FakeResponse(500, b""), "host_unavailable"),
        (requests.ConnectionError("down"), "host_unavailable"),
        (requests.Timeout("slow"), "host_unavailable"),
    ],
)
def test_failed_file_checks_report_a_code(team, hosts, file_response, code):
    link(team["project"], REPOS["github"][0])
    status_of(team["owner"])
    serve_repo(hosts, "github", file_body=file_response)
    response = check(team["owner"])
    assert response.status_code == 400
    assert response.json() == {"code": code}
    assert status_of(team["owner"]).json()["verified"] is False
    event = AuditEvent.objects.filter(kind=AuditEvent.Kind.PROJECT_VERIFICATION_FAILED).get()
    assert event.data["reason"] == code
    # Redirects are not followed: nothing beyond the two fixed addresses was requested.
    assert len(hosts.calls) == 2


@pytest.mark.parametrize(
    ("kind", "info"),
    [
        ("github", {"private": True}),
        ("github", {}),
        ("gitlab", {"visibility": "internal"}),
        ("codeberg", {"private": True}),
    ],
)
def test_private_repositories_cannot_be_verified(team, hosts, kind, info):
    link(team["project"], REPOS[kind][0])
    code = status_of(team["owner"]).json()["code"]
    serve_repo(hosts, kind, info=info, file_body=FakeResponse(200, code))
    assert check(team["owner"]).json() == {"code": "not_public"}
    assert len(hosts.calls) == 1  # the file is not even requested


def test_hidden_repositories_count_as_not_public(team, hosts):
    link(team["project"], REPOS["github"][0])  # nothing served: the host answers 404
    assert check(team["owner"]).json() == {"code": "not_public"}


@pytest.mark.parametrize(
    "url", ["", "https://example.org/octo/app", "https://github.com/octo/app/tree/main"]
)
def test_unsupported_links_cause_no_outgoing_request(team, hosts, url):
    link(team["project"], url)
    state = status_of(team["owner"]).json()
    assert state["host"] is None
    assert state["code"] is None
    assert check(team["owner"]).json() == {"code": "unsupported_repository"}
    assert hosts.calls == []


def test_changing_the_link_removes_the_verification(team, hosts):
    link(team["project"], REPOS["github"][0])
    code = status_of(team["owner"]).json()["code"]
    serve_repo(hosts, "github", file_body=FakeResponse(200, code))
    assert check(team["owner"]).json()["verified"] is True

    link(team["project"], REPOS["codeberg"][0])
    state = status_of(team["owner"]).json()
    assert state["verified"] is False
    assert state["code"] != code  # a new code for the new link
    assert client_for().get("/api/v1/projects/verified-app/").json()["verification_method"] is None

    # Switching back does not restore the old proof either.
    link(team["project"], REPOS["github"][0])
    assert status_of(team["owner"]).json()["verified"] is False


def test_only_the_team_sees_and_runs_checks(team, hosts):
    link(team["project"], REPOS["github"][0])
    slug = "verified-app"
    code = status_of(team["owner"]).json()["code"]
    stranger = client_for(team["stranger"])
    assert stranger.get(f"/api/v1/projects/{slug}/verification/").status_code == 404
    assert stranger.post(f"/api/v1/projects/{slug}/verification/file/").status_code == 404
    assert stranger.post(f"/api/v1/projects/{slug}/verification/github/").status_code == 404
    anonymous = client_for()
    assert anonymous.get(f"/api/v1/projects/{slug}/verification/").status_code in {401, 403}
    assert anonymous.post(f"/api/v1/projects/{slug}/verification/file/").status_code in {401, 403}
    # The check code never appears in the public project data.
    assert code not in anonymous.get(f"/api/v1/projects/{slug}/").content.decode()
    assert hosts.calls == []


def test_private_projects_stay_404_for_strangers(team, hosts):
    owner = team["owner"]
    new_project(owner, "hidden-app", "private")
    assert status_of(team["stranger"], "hidden-app").status_code == 404
    assert status_of(owner, "hidden-app").status_code == 200


def test_checks_are_rate_limited_per_project(team, hosts):
    link(team["project"], REPOS["github"][0])
    for _ in range(ATTEMPTS_PER_HOUR):
        assert check(team["owner"]).status_code == 400
    # The limit is shared by the whole team.
    response = check(team["maintainer"])
    assert response.status_code == 429
    assert response.json() == {"code": "rate_limited"}
    assert len(hosts.calls) == ATTEMPTS_PER_HOUR  # the blocked attempt made no request


# --- GitHub authorization --------------------------------------------------------------------


@pytest.fixture
def github_app(settings):
    settings.GITHUB_CLIENT_ID = "dummy-client-id"
    settings.GITHUB_CLIENT_SECRET = new_password()
    return settings


def start_github(client, slug: str = "verified-app") -> str:
    response = client.post(f"/api/v1/projects/{slug}/verification/github/")
    assert response.status_code == 200, response.content
    url = urlsplit(response.json()["authorize_url"])
    assert (url.scheme, url.netloc, url.path) == ("https", "github.com", "/login/oauth/authorize")
    return parse_qs(url.query, keep_blank_values=True)["state"][0]


def serve_github_oauth(hosts, token: str, permissions: dict | None) -> None:
    hosts.add(
        "POST",
        "https://github.com/login/oauth/access_token",
        FakeResponse(200, {"access_token": token, "token_type": "bearer", "scope": ""}),
    )
    info = {"private": False}
    if permissions is not None:
        info["permissions"] = permissions
    hosts.add("GET", "https://api.github.com/repos/octo/app", FakeResponse(200, info))
    hosts.add(
        "DELETE", "https://api.github.com/applications/dummy-client-id/token", FakeResponse(204)
    )


def test_github_start_builds_the_authorization_link(team, hosts, github_app):
    link(team["project"], REPOS["github"][0])
    response = client_for(team["owner"]).post("/api/v1/projects/verified-app/verification/github/")
    query = parse_qs(urlsplit(response.json()["authorize_url"]).query, keep_blank_values=True)
    assert query["client_id"] == ["dummy-client-id"]
    assert query["redirect_uri"] == [f"{github_app.FRONTEND_URL}/projects/github/verify/callback"]
    assert query["scope"] == [""]  # no scope: no access to private data or repositories
    assert status_of(team["owner"]).json()["github_available"] is True
    assert hosts.calls == []


@pytest.mark.parametrize("role", ["admin", "maintain"])
def test_github_maintainers_verify_and_the_token_is_revoked(team, hosts, github_app, caplog, role):
    link(team["project"], REPOS["github"][0])
    client = client_for(team["maintainer"])
    state = start_github(client)
    token = f"gho_{new_password()}"
    serve_github_oauth(hosts, token, {"admin": role == "admin", "maintain": True, "push": True})

    with caplog.at_level(logging.DEBUG):
        response = client.get(CALLBACK, {"state": state, "code": "one-time-code"})
    assert response.status_code == 200, response.content
    assert response.json() == {"slug": "verified-app"}
    assert status_of(team["maintainer"]).json()["method"] == "github"

    token_exchange, repo, revoke = hosts.calls
    assert token_exchange["data"]["redirect_uri"].endswith("/projects/github/verify/callback")
    assert repo["headers"]["Authorization"] == f"Bearer {token}"
    assert revoke["method"] == "DELETE"
    assert revoke["auth"] == ("dummy-client-id", github_app.GITHUB_CLIENT_SECRET)
    assert revoke["json"] == {"access_token": token}
    # The token appears nowhere: not in responses, the audit log or the logs.
    assert token not in response.content.decode()
    assert all(token not in json.dumps(e.data) for e in AuditEvent.objects.all())
    assert token not in caplog.text
    assert all(token not in str(v) for v in RepositoryVerification.objects.values().get().values())


@pytest.mark.parametrize(
    "permissions", [{"admin": False, "maintain": False, "push": True}, {"pull": True}, None]
)
def test_github_without_maintain_rights_is_refused(team, hosts, github_app, permissions):
    link(team["project"], REPOS["github"][0])
    client = client_for(team["owner"])
    state = start_github(client)
    serve_github_oauth(hosts, f"gho_{new_password()}", permissions)
    response = client.get(CALLBACK, {"state": state, "code": "c"})
    assert response.status_code == 400
    assert response.json() == {"code": "not_maintainer", "slug": "verified-app"}
    assert hosts.calls[-1]["method"] == "DELETE"  # revoked even when the check fails
    assert status_of(team["owner"]).json()["verified"] is False


def test_github_private_repository_is_refused_and_token_revoked(team, hosts, github_app):
    link(team["project"], REPOS["github"][0])
    client = client_for(team["owner"])
    state = start_github(client)
    serve_github_oauth(hosts, f"gho_{new_password()}", {"admin": True})
    hosts.add(
        "GET",
        "https://api.github.com/repos/octo/app",
        FakeResponse(200, {"private": True, "permissions": {"admin": True}}),
    )
    response = client.get(CALLBACK, {"state": state, "code": "c"})
    assert response.json()["code"] == "not_public"
    assert hosts.calls[-1]["method"] == "DELETE"


def test_github_state_is_signed_single_use_and_bound_to_the_session(team, hosts, github_app):
    link(team["project"], REPOS["github"][0])
    owner = client_for(team["owner"])
    state = start_github(owner)
    serve_github_oauth(hosts, f"gho_{new_password()}", {"admin": True})

    forged = state[:-4] + ("AAAA" if not state.endswith("AAAA") else "BBBB")
    assert owner.get(CALLBACK, {"state": forged, "code": "c"}).json() == {"code": "invalid_state"}
    # The failed attempt used up the session nonce: the genuine state no longer works either.
    assert owner.get(CALLBACK, {"state": state, "code": "c"}).json() == {"code": "invalid_state"}
    # Another account (another session) cannot use someone else's state.
    state = start_github(owner)
    maintainer = client_for(team["maintainer"])
    start_github(maintainer)
    assert maintainer.get(CALLBACK, {"state": state, "code": "c"}).json() == {
        "code": "invalid_state"
    }
    # Successful use consumes the state.
    assert owner.get(CALLBACK, {"state": state, "code": "c"}).status_code == 200
    assert owner.get(CALLBACK, {"state": state, "code": "c"}).json() == {"code": "invalid_state"}


def test_github_state_dies_when_the_link_changes(team, hosts, github_app):
    link(team["project"], REPOS["github"][0])
    owner = client_for(team["owner"])
    state = start_github(owner)
    link(team["project"], "https://github.com/octo/other")
    response = owner.get(CALLBACK, {"state": state, "code": "c"})
    assert response.json() == {"code": "repository_changed"}
    assert hosts.calls == []


def test_github_cancel_returns_to_the_project(team, hosts, github_app):
    link(team["project"], REPOS["github"][0])
    owner = client_for(team["owner"])
    state = start_github(owner)
    response = owner.get(CALLBACK, {"state": state, "error": "access_denied"})
    assert response.json() == {"code": "cancelled", "slug": "verified-app"}
    assert hosts.calls == []


def test_github_way_needs_a_github_repository_and_a_configured_app(team, hosts, settings):
    settings.GITHUB_CLIENT_ID = ""
    settings.GITHUB_CLIENT_SECRET = ""
    link(team["project"], REPOS["github"][0])
    owner = client_for(team["owner"])
    assert status_of(team["owner"]).json()["github_available"] is False
    response = owner.post("/api/v1/projects/verified-app/verification/github/")
    assert response.json() == {"code": "github_unavailable"}

    settings.GITHUB_CLIENT_ID = "dummy-client-id"
    settings.GITHUB_CLIENT_SECRET = new_password()
    link(team["project"], REPOS["gitlab"][0])
    assert status_of(team["owner"]).json()["github_available"] is False
    response = owner.post("/api/v1/projects/verified-app/verification/github/")
    assert response.json() == {"code": "not_github"}


def test_github_callback_requires_a_signed_in_team_member(team, hosts, github_app):
    link(team["project"], REPOS["github"][0])
    state = start_github(client_for(team["owner"]))
    anonymous = client_for().get(CALLBACK, {"state": state, "code": "c"})
    assert anonymous.status_code in {401, 403}
    # Removed from the team between start and callback: the state no longer works.
    maintainer = client_for(team["maintainer"])
    state = start_github(maintainer)
    team["project"].memberships.filter(user=team["maintainer"]).delete()
    response = maintainer.get(CALLBACK, {"state": state, "code": "c"})
    assert response.json() == {"code": "invalid_state"}
    assert hosts.calls == []
