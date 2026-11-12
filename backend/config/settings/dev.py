"""Local development. NEVER use in production."""

from .base import *  # noqa: F403
from .base import REST_FRAMEWORK
from .env import env_list, env_str

DEBUG = True

# Deliberately, obviously insecure and non-secret development key.
SECRET_KEY = env_str("DJANGO_SECRET_KEY", "dev-only-insecure-key-do-not-use-in-production")

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", ["localhost", "127.0.0.1"])

SERVE_API_SCHEMA = True

CSRF_TRUSTED_ORIGINS = env_list(
    "DJANGO_CSRF_TRUSTED_ORIGINS", ["http://localhost:5173", "http://127.0.0.1:5173"]
)

ENABLE_SSR_PROBE = True
INSTALLED_APPS = [*INSTALLED_APPS, "apps.ssr_probe"]  # noqa: F405

REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
        "rest_framework.renderers.BrowsableAPIRenderer",
    ],
}
