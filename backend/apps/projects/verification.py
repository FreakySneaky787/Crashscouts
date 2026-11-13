"""Repository verification (WP 2.5, ADR 0015): does this project really belong to its repository?

Two ways, both only for public repositories on GitHub, GitLab.com and Codeberg:

1. Check file: the team commits a file with a random check code to the repository root; the
   server reads it through the host's official API and compares it exactly.
2. GitHub authorization: a one-time OAuth authorization (no scope requested); the server reads the
   user's permissions on the repository (maintain or admin required), then revokes the token at
   once. The token is never stored, logged or returned.

Outgoing requests (protection against server-side request forgery): only fixed addresses built
from validated path segments (see repositories.py), no redirects followed, 5 s timeout, responses
read up to a fixed size. The proxy settings of the environment apply (requests' default).
"""

import hmac
import json
import logging
import secrets
import time
from urllib.parse import quote, urlencode

import requests
from django.conf import settings
from django.core import signing
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone

from apps.audit.models import AuditEvent
from apps.audit.services import record

from .models import Project, RepositoryVerification
from .policies import can_edit
from .repositories import RepoRef, api_calls, is_public, parse_repository_url, verification_filename

logger = logging.getLogger(__name__)

TIMEOUT_SECONDS = 5
MAX_FILE_BYTES = 4 * 1024
MAX_JSON_BYTES = 256 * 1024
ATTEMPTS_PER_HOUR = 10  # per project, shared by the whole team (protects the hosts as well)

GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"  # noqa: S105 (an address)
GITHUB_CALLBACK_PATH = "/projects/github/verify/callback"
STATE_SALT = "projects.repository-verification.github"
STATE_MAX_AGE_SECONDS = 600
SESSION_NONCE_KEY = "repository_verification_nonce"
GITHUB_ROLES = ("admin", "maintain")


class VerificationError(Exception):
    """A failed check; ``code`` goes to the frontend (mapped to a text there)."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


# --- Status --------------------------------------------------------------------------------


def challenge_for(project: Project) -> RepositoryVerification:
    """The project's verification row with a check code for the current repository URL."""
    row = RepositoryVerification.objects.filter(project=project).first()
    if row is not None and row.repository_url == project.repository_url:
        return row
    if row is not None:
        row.delete()  # the link changed: the old code and proof are void
    row, _ = RepositoryVerification.objects.get_or_create(
        project=project,
        defaults={"repository_url": project.repository_url, "code": secrets.token_urlsafe(24)},
    )
    return row


def verified_method(project: Project) -> str | None:
    """The method ("file" or "github") while the proof is valid for the current link; else None."""
    row = RepositoryVerification.objects.filter(project=project).first()
    return row.method if row is not None and row.is_valid_for(project) else None


def forget(project: Project) -> None:
    """Called when the repository link changes."""
    RepositoryVerification.objects.filter(project=project).delete()


def github_configured() -> bool:
    return bool(settings.GITHUB_CLIENT_ID and settings.GITHUB_CLIENT_SECRET)


def take_attempt(project: Project) -> bool:
    """Fixed one-hour window per project; False once the limit is used up."""
    key = f"repository-verification:{project.pk}:{int(time.time() // 3600)}"
    cache.add(key, 0, timeout=3600)
    try:
        count = cache.incr(key)
    except ValueError:  # expired between add and incr
        cache.set(key, 1, timeout=3600)
        count = 1
    return count <= ATTEMPTS_PER_HOUR


def _mark_verified(project: Project, row: RepositoryVerification, user, method: str) -> None:
    with transaction.atomic():
        updated = RepositoryVerification.objects.filter(
            pk=row.pk, repository_url=project.repository_url
        ).update(method=method, verified_at=timezone.now(), verified_by=user)
        if not updated:
            raise VerificationError("repository_changed")
        record(
            AuditEvent.Kind.PROJECT_VERIFIED,
            actor=user,
            data={"project": str(project.pk), "method": method},
        )


def _failed(project: Project, user, method: str, error: VerificationError) -> VerificationError:
    record(
        AuditEvent.Kind.PROJECT_VERIFICATION_FAILED,
        actor=user,
        data={"project": str(project.pk), "method": method, "reason": error.code},
    )
    return error


# --- Outgoing requests -----------------------------------------------------------------------


def _user_agent() -> str:
    return f"{settings.PLATFORM_NAME}-repository-verification"


def _request(method: str, url: str, *, limit: int, headers=None, **kwargs) -> tuple[int, bytes]:
    """One request to a fixed address: no redirects, timeout, body read up to ``limit``."""
    try:
        with requests.request(
            method,
            url,
            headers={"User-Agent": _user_agent(), **(headers or {})},
            timeout=TIMEOUT_SECONDS,
            allow_redirects=False,
            stream=True,
            **kwargs,
        ) as response:
            chunks, size = [], 0
            for chunk in response.iter_content(chunk_size=1024):
                size += len(chunk)
                if size > limit:
                    raise VerificationError("response_too_large")
                chunks.append(chunk)
            return response.status_code, b"".join(chunks)
    except requests.RequestException:
        # The exception text may contain the address but never a header (no token in logs).
        logger.warning("Repository verification: request to %s failed", url.split("?")[0])
        raise VerificationError("host_unavailable") from None


def _repository_info(ref: RepoRef, url: str, headers=None) -> dict:
    status, body = _request("GET", url, limit=MAX_JSON_BYTES, headers=headers)
    if 300 <= status < 400:
        raise VerificationError("repository_moved")
    if status == 404:
        raise VerificationError("not_public")  # private repositories look like missing ones
    if status != 200:
        raise VerificationError("host_unavailable")
    try:
        info = json.loads(body)
    except ValueError:
        raise VerificationError("host_unavailable") from None
    if not isinstance(info, dict):
        raise VerificationError("host_unavailable")
    if not is_public(ref, info):
        raise VerificationError("not_public")
    return info


def _supported_ref(project: Project) -> RepoRef:
    ref = parse_repository_url(project.repository_url) if project.repository_url else None
    if ref is None:
        raise VerificationError("unsupported_repository")
    return ref


# --- Way 1: check file -----------------------------------------------------------------------


def check_file(project: Project, user) -> None:
    """Raises VerificationError on failure; marks the project verified on success."""
    row = challenge_for(project)
    try:
        ref = _supported_ref(project)
        calls = api_calls(ref, verification_filename())
        _repository_info(ref, calls.repo_url)
        status, body = _request(
            "GET", calls.file_url, limit=MAX_FILE_BYTES, headers=calls.file_headers
        )
        if 300 <= status < 400:
            raise VerificationError("repository_moved")
        if status == 404:
            raise VerificationError("file_missing")
        if status != 200:
            raise VerificationError("host_unavailable")
        content = body.decode("utf-8", errors="replace").lstrip("﻿").strip()
        if not hmac.compare_digest(content.encode(), row.code.encode()):
            raise VerificationError("code_mismatch")
    except VerificationError as error:
        raise _failed(project, user, RepositoryVerification.Method.FILE, error) from None
    _mark_verified(project, row, user, RepositoryVerification.Method.FILE)


# --- Way 2: GitHub authorization -------------------------------------------------------------


def github_redirect_uri() -> str:
    return f"{settings.FRONTEND_URL}{GITHUB_CALLBACK_PATH}"


def github_authorize_url(request, project: Project) -> str:
    """Starts the one-time authorization; the state is signed and bound to session and project."""
    ref = _supported_ref(project)
    if ref.kind != "github":
        raise VerificationError("not_github")
    if not github_configured():
        raise VerificationError("github_unavailable")
    nonce = secrets.token_urlsafe(16)
    request.session[SESSION_NONCE_KEY] = nonce
    state = signing.dumps(
        {"p": str(project.pk), "u": str(request.user.pk), "r": project.repository_url, "n": nonce},
        salt=STATE_SALT,
    )
    query = urlencode(
        {
            "client_id": settings.GITHUB_CLIENT_ID,
            "redirect_uri": github_redirect_uri(),
            "scope": "",  # no scope: read-only access to public information
            "state": state,
            "allow_signup": "false",
        }
    )
    return f"{GITHUB_AUTHORIZE_URL}?{query}"


def project_from_state(request, state: str) -> Project:
    """The project of a valid, unused state for this user and session; else invalid_state."""
    expected_nonce = request.session.pop(SESSION_NONCE_KEY, None)  # single use
    try:
        data = signing.loads(state, salt=STATE_SALT, max_age=STATE_MAX_AGE_SECONDS)
    except signing.BadSignature:
        raise VerificationError("invalid_state") from None
    if (
        not isinstance(data, dict)
        or expected_nonce is None
        or not hmac.compare_digest(str(data.get("n", "")), expected_nonce)
        or str(data.get("u")) != str(request.user.pk)
    ):
        raise VerificationError("invalid_state")
    project = Project.objects.filter(pk=data.get("p")).first()
    if project is None or not can_edit(request.user, project):
        raise VerificationError("invalid_state")
    if project.repository_url != data.get("r"):
        raise VerificationError("repository_changed")
    return project


def _exchange_code(code: str) -> str:
    status, body = _request(
        "POST",
        GITHUB_TOKEN_URL,
        limit=MAX_JSON_BYTES,
        headers={"Accept": "application/json"},
        data={
            "client_id": settings.GITHUB_CLIENT_ID,
            "client_secret": settings.GITHUB_CLIENT_SECRET,
            "code": code,
            "redirect_uri": github_redirect_uri(),
        },
    )
    try:
        token = json.loads(body).get("access_token") if status == 200 else None
    except ValueError, AttributeError:
        token = None
    if not isinstance(token, str) or not token:
        raise VerificationError("github_failed")
    return token


def _revoke(token: str) -> None:
    """Deletes the token at GitHub (basic auth with the app's client ID and secret)."""
    client_id = settings.GITHUB_CLIENT_ID
    try:
        status, _ = _request(
            "DELETE",
            f"https://api.github.com/applications/{quote(client_id, safe='')}/token",
            limit=MAX_JSON_BYTES,
            headers={"Accept": "application/vnd.github+json"},
            auth=(client_id, settings.GITHUB_CLIENT_SECRET),
            json={"access_token": token},
        )
    except VerificationError:
        status = None
    if status != 204:
        # Without the token: it is discarded either way and expires at GitHub.
        logger.warning("Repository verification: GitHub token revocation answered %s", status)


def check_github(project: Project, user, code: str) -> None:
    """Exchanges the code, checks maintain/admin on the repository, revokes the token."""
    row = challenge_for(project)
    try:
        ref = _supported_ref(project)
        if ref.kind != "github":
            raise VerificationError("not_github")
        token = _exchange_code(code)
        try:
            info = _repository_info(
                ref,
                api_calls(ref, verification_filename()).repo_url,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/vnd.github+json",
                },
            )
        finally:
            _revoke(token)
            del token
        permissions = info.get("permissions")
        if not isinstance(permissions, dict) or not any(
            permissions.get(role) is True for role in GITHUB_ROLES
        ):
            raise VerificationError("not_maintainer")
    except VerificationError as error:
        raise _failed(project, user, RepositoryVerification.Method.GITHUB, error) from None
    _mark_verified(project, row, user, RepositoryVerification.Method.GITHUB)
