"""Production settings are checked in a separate process so that this process's test settings
stay untouched."""

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[3]

# Random value generated for this test only (not a real secret).
VALID_KEY = "x" * 10 + os.urandom(32).hex()

PROBE = """
import json, django
from django.conf import settings
django.setup()
print(json.dumps({
    "DEBUG": settings.DEBUG,
    "SESSION_COOKIE_SECURE": settings.SESSION_COOKIE_SECURE,
    "CSRF_COOKIE_SECURE": settings.CSRF_COOKIE_SECURE,
    "SECURE_SSL_REDIRECT": settings.SECURE_SSL_REDIRECT,
    "SECURE_HSTS_SECONDS": settings.SECURE_HSTS_SECONDS,
    "SERVE_API_SCHEMA": settings.SERVE_API_SCHEMA,
    "ALLOWED_HOSTS": settings.ALLOWED_HOSTS,
    "ENABLE_SSR_PROBE": settings.ENABLE_SSR_PROBE,
    "PROBE_INSTALLED": "apps.ssr_probe" in settings.INSTALLED_APPS,
    "SIGNUP_ENABLED": settings.SIGNUP_ENABLED,
    "EMAIL_USE_TLS": settings.MAILERS["default"]["OPTIONS"]["use_tls"],
    "CONFIRM_URL": settings.HEADLESS_FRONTEND_URLS["account_confirm_email"],
}))
"""


def _run(
    code: str, extra_env: dict[str, str], drop: tuple[str, ...] = ()
) -> subprocess.CompletedProcess:
    env = {**os.environ, "DJANGO_SETTINGS_MODULE": "config.settings.prod", **extra_env}
    for name in drop:
        env.pop(name, None)
    return subprocess.run(
        [sys.executable, "-c", code],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )


def _prod_env(**overrides: str) -> dict[str, str]:
    return {
        "DJANGO_SECRET_KEY": VALID_KEY,
        "DJANGO_ALLOWED_HOSTS": "example.invalid",
        "POSTGRES_PASSWORD": "irrelevant-for-this-test",
        "FRONTEND_URL": "https://example.invalid",
        "DJANGO_EMAIL_HOST": "smtp.example.invalid",
        "DJANGO_DEFAULT_FROM_EMAIL": "no-reply@example.invalid",
        "DJANGO_MEDIA_ROOT": "/srv/example-media",
        **overrides,
    }


def test_prod_settings_are_secure():
    result = _run(PROBE, _prod_env())

    assert result.returncode == 0, result.stderr
    values = json.loads(result.stdout.strip().splitlines()[-1])
    assert values == {
        "DEBUG": False,
        "SESSION_COOKIE_SECURE": True,
        "CSRF_COOKIE_SECURE": True,
        "SECURE_SSL_REDIRECT": True,
        "SECURE_HSTS_SECONDS": 31_536_000,
        "SERVE_API_SCHEMA": False,
        "ALLOWED_HOSTS": ["example.invalid"],
        "ENABLE_SSR_PROBE": False,
        "PROBE_INSTALLED": False,
        "SIGNUP_ENABLED": False,
        "EMAIL_USE_TLS": True,
        "CONFIRM_URL": "https://example.invalid/verify-email/{key}",
    }


def test_prod_refuses_to_start_without_secret_key():
    result = _run(PROBE, _prod_env(), drop=("DJANGO_SECRET_KEY",))

    assert result.returncode != 0
    assert "DJANGO_SECRET_KEY" in result.stderr


@pytest.mark.parametrize(
    "weak_key",
    [
        "short",
        "dev-only-insecure-key-do-not-use-in-production" + "x" * 10,
        "django-insecure-" + "a" * 50,
    ],
)
def test_prod_refuses_weak_or_development_secret_key(weak_key):
    result = _run(PROBE, _prod_env(DJANGO_SECRET_KEY=weak_key))

    assert result.returncode != 0
    assert "DJANGO_SECRET_KEY" in result.stderr


def test_prod_refuses_to_start_without_allowed_hosts():
    result = _run(PROBE, _prod_env(), drop=("DJANGO_ALLOWED_HOSTS",))

    assert result.returncode != 0
    assert "DJANGO_ALLOWED_HOSTS" in result.stderr


@pytest.mark.parametrize(
    "missing",
    ["FRONTEND_URL", "DJANGO_EMAIL_HOST", "DJANGO_DEFAULT_FROM_EMAIL", "DJANGO_MEDIA_ROOT"],
)
def test_prod_refuses_to_start_without_mail_configuration(missing):
    result = _run(PROBE, _prod_env(), drop=(missing,))

    assert result.returncode != 0
    assert missing in result.stderr


def test_prod_refuses_plain_http_frontend_url():
    result = _run(PROBE, _prod_env(FRONTEND_URL="http://example.invalid"))

    assert result.returncode != 0
    assert "FRONTEND_URL" in result.stderr


def test_prod_deploy_check_has_only_documented_warnings():
    """`manage.py check --deploy` may only report the deliberately open HSTS domain warnings.

    security.W005 (includeSubDomains) and security.W021 (preload) stay open until the domain
    is decided (see config/settings/prod.py).
    """
    env = {**os.environ, **_prod_env(), "DJANGO_SETTINGS_MODULE": "config.settings.prod"}
    result = subprocess.run(
        [sys.executable, "manage.py", "check", "--deploy"],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    output = result.stdout + result.stderr
    reported = {token.rstrip(":)") for token in output.split() if token.startswith("(security.")}
    reported = {token.strip("()") for token in reported}

    assert result.returncode == 0, output
    assert reported <= {"security.W005", "security.W021"}, output
