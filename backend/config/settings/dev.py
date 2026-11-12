"""Local development. NEVER use in production."""

from .base import *  # noqa: F403
from .base import REST_FRAMEWORK
from .env import env_bool, env_list, env_str

DEBUG = True

# Deliberately, obviously insecure and non-secret development key.
SECRET_KEY = env_str("DJANGO_SECRET_KEY", "dev-only-insecure-key-do-not-use-in-production")

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", ["localhost", "127.0.0.1"])

SERVE_API_SCHEMA = True

CSRF_TRUSTED_ORIGINS = env_list(
    "DJANGO_CSRF_TRUSTED_ORIGINS", ["http://localhost:5173", "http://127.0.0.1:5173"]
)

# Signup is open locally unless switched off; emails go to Mailpit (docker compose up -d mailpit).
SIGNUP_ENABLED = env_bool("DJANGO_SIGNUP_ENABLED", True)

# The E2E suite signs in many times per minute from one IP (127.0.0.1) and would hit allauth's
# rate limits. This switch exists ONLY in the development settings; production and the pytest
# settings keep the defaults, and the limits themselves are tested in pytest.
if env_bool("DJANGO_E2E_RELAXED_RATE_LIMITS", False):
    ACCOUNT_RATE_LIMITS = {
        "login": "1000/m/ip",
        "login_failed": "1000/m/ip,100/5m/key",
        "signup": "1000/m/ip",
        "reset_password": "1000/m/ip,100/m/key",
    }

ENABLE_SSR_PROBE = True
INSTALLED_APPS = [*INSTALLED_APPS, "apps.ssr_probe"]  # noqa: F405

REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
        "rest_framework.renderers.BrowsableAPIRenderer",
    ],
}
