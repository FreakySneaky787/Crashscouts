"""Einstellungen für automatisierte Tests (pytest). Läuft gegen echtes PostgreSQL."""

from .base import *  # noqa: F403

DEBUG = False
# Absichtlich unsicherer, öffentlicher Testschlüssel (kein Geheimnis).
SECRET_KEY = "test-only-insecure-key-do-not-use-in-production"  # noqa: S105
ALLOWED_HOSTS = ["testserver", "localhost", "127.0.0.1"]
SERVE_API_SCHEMA = False

ENABLE_SSR_PROBE = True
INSTALLED_APPS = [*INSTALLED_APPS, "apps.ssr_probe"]  # noqa: F405
