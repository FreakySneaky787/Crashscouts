"""Production. Security values are enforced here; missing required values prevent startup.

Assumption (see docs/ARCHITECTURE.md): Django runs behind a reverse proxy that terminates TLS,
sets the X-Forwarded-Proto header itself and overwrites any value sent by clients.
"""

from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F403
from .env import env_bool, env_int, env_list, env_str

DEBUG = False

SECRET_KEY = env_str("DJANGO_SECRET_KEY")
if len(SECRET_KEY) < 50 or SECRET_KEY.startswith(("dev-only", "test-only", "django-insecure")):
    raise ImproperlyConfigured(
        "DJANGO_SECRET_KEY is too short or a development key "
        "(at least 50 random characters required)."
    )

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS")
CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS", [])

# --- HTTPS / Proxy ---
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = env_bool("DJANGO_SECURE_SSL_REDIRECT", True)
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

# HSTS: 1 year. includeSubDomains and preload are commitments for the (not yet chosen) domain
# and stay off until the domain is decided (project owner's decision).
SECURE_HSTS_SECONDS = env_int("DJANGO_SECURE_HSTS_SECONDS", 31_536_000)
SECURE_HSTS_INCLUDE_SUBDOMAINS = env_bool("DJANGO_SECURE_HSTS_INCLUDE_SUBDOMAINS", False)
SECURE_HSTS_PRELOAD = env_bool("DJANGO_SECURE_HSTS_PRELOAD", False)

SERVE_API_SCHEMA = False

# The SSR probe is a pure test tool and must never be active in production.
ENABLE_SSR_PROBE = False
if "apps.ssr_probe" in INSTALLED_APPS:  # noqa: F405
    raise ImproperlyConfigured("apps.ssr_probe must not be installed in production.")
