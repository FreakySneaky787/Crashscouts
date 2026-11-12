"""Produktion. Sicherheitswerte werden hier erzwungen; fehlende Pflichtwerte verhindern den Start.

Annahme (siehe docs/ARCHITECTURE.md): Django läuft hinter einem Reverse Proxy, der TLS terminiert,
den Header X-Forwarded-Proto selbst setzt und von Clients gesendete Werte überschreibt.
"""

from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F403
from .env import env_bool, env_int, env_list, env_str

DEBUG = False

SECRET_KEY = env_str("DJANGO_SECRET_KEY")
if len(SECRET_KEY) < 50 or SECRET_KEY.startswith(("dev-only", "test-only", "django-insecure")):
    raise ImproperlyConfigured(
        "DJANGO_SECRET_KEY ist zu kurz oder ein Entwicklungsschlüssel "
        "(mindestens 50 Zeichen, zufällig)."
    )

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS")
CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS", [])

# --- HTTPS / Proxy ---
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = env_bool("DJANGO_SECURE_SSL_REDIRECT", True)
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

# HSTS: 1 Jahr. includeSubDomains und preload sind Verpflichtungen für die (noch nicht
# gewählte) Domain und bleiben aus, bis die Domain feststeht (Entscheid Projektverantwortlicher).
SECURE_HSTS_SECONDS = env_int("DJANGO_SECURE_HSTS_SECONDS", 31_536_000)
SECURE_HSTS_INCLUDE_SUBDOMAINS = env_bool("DJANGO_SECURE_HSTS_INCLUDE_SUBDOMAINS", False)
SECURE_HSTS_PRELOAD = env_bool("DJANGO_SECURE_HSTS_PRELOAD", False)

SERVE_API_SCHEMA = False

# Die SSR-Probe ist ein reines Testwerkzeug und darf in Produktion nie aktiv sein.
ENABLE_SSR_PROBE = False
if "apps.ssr_probe" in INSTALLED_APPS:  # noqa: F405
    raise ImproperlyConfigured("apps.ssr_probe darf in Produktion nicht installiert sein.")
