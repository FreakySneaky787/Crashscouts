"""Gemeinsame Einstellungen für alle Umgebungen.

Sicherheitsrelevante Werte für die Produktion stehen in prod.py und werden dort erzwungen.
"""

from pathlib import Path

from .env import env_int, env_str

BASE_DIR = Path(__file__).resolve().parent.parent.parent

# Zentraler, austauschbarer Plattformname (Arbeitsname "TestHub" ist ein Platzhalter).
PLATFORM_NAME = env_str("PLATFORM_NAME", "TestHub")

DEBUG = False

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "drf_spectacular",
    "apps.core",
    "apps.accounts",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# --- Datenbank: ausschliesslich PostgreSQL (auch in Tests) ---
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env_str("POSTGRES_DB", "testhub"),
        "USER": env_str("POSTGRES_USER", "testhub"),
        "PASSWORD": env_str("POSTGRES_PASSWORD"),
        "HOST": env_str("POSTGRES_HOST", "127.0.0.1"),
        "PORT": env_int("POSTGRES_PORT", 5432),
        "CONN_MAX_AGE": env_int("POSTGRES_CONN_MAX_AGE", 60),
        "CONN_HEALTH_CHECKS": True,
    }
}

# --- Benutzer & Passwörter ---
AUTH_USER_MODEL = "accounts.User"

# Argon2 zuerst (Empfehlung der Django-Doku); weitere Hasher nur zum Prüfen/Umstellen alter Hashes.
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher",
    "django.contrib.auth.hashers.ScryptPasswordHasher",
]

# Passwortregeln werden in Phase 1 (Registrierung) festgelegt; bis dahin Django-Standard.
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# Für Drittanbieter-Modelle; eigene Modelle verwenden UUIDv4 (siehe apps.core.models).
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- Internationalisierung ---
LANGUAGE_CODE = "en"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# --- Sicherheits-Grundwerte (gelten überall; prod.py verschärft) ---
X_FRAME_OPTIONS = "DENY"
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin"
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"

# --- API ---
REST_FRAMEWORK = {
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    # Sicherer Standard: alles erfordert Anmeldung, öffentliche Endpunkte erlauben es explizit.
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
    ],
}

SPECTACULAR_SETTINGS = {
    "TITLE": f"{PLATFORM_NAME} API",
    "VERSION": "0.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
}

# Der Schema-Endpunkt ist nur in der Entwicklung erreichbar (siehe dev.py / config/urls.py).
SERVE_API_SCHEMA = False

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}
