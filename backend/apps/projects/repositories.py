"""Repository URLs of the supported code hosts and the fixed API addresses derived from them.

Only these hosts are ever contacted (owner's decision, WP 2.5): the server builds every outgoing
URL itself from validated path segments; a user can never make it request an arbitrary address
(protection against server-side request forgery).

API formats (checked against the official specifications, see ADR 0015):
- GitHub REST: GET /repos/{owner}/{repo} ("private", "permissions"),
  GET /repos/{owner}/{repo}/contents/{path} with media type application/vnd.github.raw+json
  (default branch when "ref" is omitted).
- GitLab REST v4: GET /projects/:id ("visibility"),
  GET /projects/:id/repository/files/:file_path/raw?ref=HEAD (HEAD = default branch).
- Codeberg runs Forgejo with the Gitea API v1: GET /repos/{owner}/{repo} ("private"),
  GET /repos/{owner}/{repo}/raw/{filepath} (default branch when "ref" is omitted).
"""

import re
from dataclasses import dataclass
from urllib.parse import quote, urlsplit

from django.conf import settings
from django.utils.text import slugify

HOSTS = {"github.com": "github", "gitlab.com": "gitlab", "codeberg.org": "codeberg"}
SEGMENT = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$")
MAX_GITLAB_DEPTH = 10


@dataclass(frozen=True)
class RepoRef:
    kind: str  # "github" | "gitlab" | "codeberg"
    segments: tuple[str, ...]  # owner (or GitLab groups) ... repository name

    @property
    def owner(self) -> str:
        return self.segments[0]

    @property
    def name(self) -> str:
        return self.segments[-1]


def parse_repository_url(url: str) -> RepoRef | None:
    """https://<supported host>/<owner>/<repo> (GitLab: nested groups allowed); else None."""
    try:
        parts = urlsplit(url.strip())
    except ValueError:
        return None
    if parts.scheme != "https" or parts.username or parts.password or parts.port:
        return None
    if parts.query or parts.fragment:
        return None
    kind = HOSTS.get((parts.hostname or "").lower())
    if kind is None:
        return None
    path = parts.path.strip("/")
    if path.endswith(".git"):
        path = path[: -len(".git")]
    segments = tuple(path.split("/")) if path else ()
    if any(not SEGMENT.fullmatch(s) or s.endswith(".") for s in segments):
        return None
    valid_depth = len(segments) == 2 or (
        kind == "gitlab" and 2 <= len(segments) <= MAX_GITLAB_DEPTH
    )
    if not valid_depth:
        return None
    return RepoRef(kind, segments)


def verification_filename() -> str:
    """The check file in the repository root, derived centrally from the platform name."""
    configured = getattr(settings, "PROJECT_VERIFICATION_FILENAME", "")
    return configured or f".{slugify(settings.PLATFORM_NAME) or 'platform'}-verification"


@dataclass(frozen=True)
class ApiCalls:
    repo_url: str
    file_url: str
    file_headers: dict[str, str]


def api_calls(ref: RepoRef, filename: str) -> ApiCalls:
    """Fixed API addresses for one repository; every part is a validated segment."""
    encoded_file = quote(filename, safe="")
    if ref.kind == "github":
        base = f"https://api.github.com/repos/{ref.owner}/{ref.name}"
        return ApiCalls(
            base, f"{base}/contents/{encoded_file}", {"Accept": "application/vnd.github.raw+json"}
        )
    if ref.kind == "gitlab":
        project = quote("/".join(ref.segments), safe="")
        base = f"https://gitlab.com/api/v4/projects/{project}"
        return ApiCalls(base, f"{base}/repository/files/{encoded_file}/raw?ref=HEAD", {})
    base = f"https://codeberg.org/api/v1/repos/{ref.owner}/{ref.name}"
    return ApiCalls(base, f"{base}/raw/{encoded_file}", {})


def is_public(ref: RepoRef, repo_info: dict) -> bool:
    if ref.kind == "gitlab":
        return repo_info.get("visibility") == "public"
    return repo_info.get("private") is False
