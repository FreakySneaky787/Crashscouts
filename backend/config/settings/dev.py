"""Lokale Entwicklung. NIEMALS in Produktion verwenden."""

from .base import *  # noqa: F403
from .base import REST_FRAMEWORK
from .env import env_list, env_str

DEBUG = True

# Absichtlich offensichtlich unsicherer, nicht geheimer Entwicklungsschlüssel.
SECRET_KEY = env_str("DJANGO_SECRET_KEY", "dev-only-insecure-key-do-not-use-in-production")

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", ["localhost", "127.0.0.1"])

SERVE_API_SCHEMA = True

REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
        "rest_framework.renderers.BrowsableAPIRenderer",
    ],
}
