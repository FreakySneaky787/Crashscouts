"""Settings for automated tests (pytest). Runs against a real PostgreSQL."""

from .base import *  # noqa: F403

DEBUG = False
# Deliberately insecure, public test key (not a secret).
SECRET_KEY = "test-only-insecure-key-do-not-use-in-production"  # noqa: S105
ALLOWED_HOSTS = ["testserver", "localhost", "127.0.0.1"]
SERVE_API_SCHEMA = False

SIGNUP_ENABLED = True
# Emails are collected in memory (django.core.mail.outbox); nothing leaves the test process.
MAILERS = {"default": {"BACKEND": "django.core.mail.backends.locmem.EmailBackend"}}


ENABLE_SSR_PROBE = True
INSTALLED_APPS = [*INSTALLED_APPS, "apps.ssr_probe"]  # noqa: F405
