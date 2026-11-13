"""Repository URL parsing and the fixed API addresses (WP 2.5): no arbitrary outgoing requests."""

import pytest

from apps.projects.repositories import api_calls, is_public, parse_repository_url


@pytest.mark.parametrize(
    ("url", "kind", "segments"),
    [
        ("https://github.com/octo/app", "github", ("octo", "app")),
        ("https://github.com/octo/app.git", "github", ("octo", "app")),
        ("https://GitHub.com/octo/app/", "github", ("octo", "app")),
        ("https://gitlab.com/group/sub/app", "gitlab", ("group", "sub", "app")),
        ("https://codeberg.org/someone/tool", "codeberg", ("someone", "tool")),
    ],
)
def test_supported_urls(url, kind, segments):
    ref = parse_repository_url(url)
    assert ref is not None
    assert (ref.kind, ref.segments) == (kind, segments)


@pytest.mark.parametrize(
    "url",
    [
        "http://github.com/octo/app",  # not https
        "https://evil.example/octo/app",  # unsupported host
        "https://github.com.evil.example/octo/app",
        "https://127.0.0.1/octo/app",
        "https://user:pass@github.com/octo/app",
        "https://github.com:8443/octo/app",
        "https://github.com/octo",  # no repository
        "https://github.com/octo/app/tree/main",  # extra segments (GitHub)
        "https://codeberg.org/a/b/c",
        "https://github.com/octo/..",
        "https://github.com/octo/%2e%2e",
        "https://github.com/../etc",
        "https://github.com/octo/app?x=1",
        "https://github.com/octo/app#readme",
        "https://github.com/-octo/app",
        "",
        "javascript:alert(1)",
    ],
)
def test_everything_else_is_rejected(url):
    assert parse_repository_url(url) is None


def test_api_addresses_are_fixed_per_host():
    gh = api_calls(parse_repository_url("https://github.com/octo/app"), ".platform-verification")
    assert gh.repo_url == "https://api.github.com/repos/octo/app"
    assert gh.file_url == "https://api.github.com/repos/octo/app/contents/.platform-verification"
    assert gh.file_headers == {"Accept": "application/vnd.github.raw+json"}

    gl = api_calls(
        parse_repository_url("https://gitlab.com/group/sub/app"), ".platform-verification"
    )
    assert gl.repo_url == "https://gitlab.com/api/v4/projects/group%2Fsub%2Fapp"
    assert gl.file_url.endswith("/repository/files/.platform-verification/raw?ref=HEAD")

    cb = api_calls(
        parse_repository_url("https://codeberg.org/someone/tool"), ".platform-verification"
    )
    assert (
        cb.file_url == "https://codeberg.org/api/v1/repos/someone/tool/raw/.platform-verification"
    )


def test_public_flag_per_host():
    gh = parse_repository_url("https://github.com/o/r")
    gl = parse_repository_url("https://gitlab.com/o/r")
    assert is_public(gh, {"private": False}) is True
    assert is_public(gh, {"private": True}) is False
    assert is_public(gh, {}) is False
    assert is_public(gl, {"visibility": "public"}) is True
    assert is_public(gl, {"visibility": "internal"}) is False
