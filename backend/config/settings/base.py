"""Settings shared by all environments.

Security-relevant production values live in prod.py and are enforced there.
"""

from pathlib import Path

from .env import env_bool, env_int, env_list, env_str

BASE_DIR = Path(__file__).resolve().parent.parent.parent

# Central, replaceable platform name (the working name "TestHub" is a placeholder).
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
    "allauth",
    "allauth.account",
    "allauth.headless",
    "allauth.mfa",
    "apps.core",
    "apps.accounts",
    "apps.audit",
    "apps.catalog",
    "apps.profiles",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "allauth.account.middleware.AccountMiddleware",
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

# --- Database: PostgreSQL only (also in tests) ---
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

# --- Users & passwords ---
AUTH_USER_MODEL = "accounts.User"

# Argon2 first (recommended by the Django docs); others only verify/upgrade legacy hashes.
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher",
    "django.contrib.auth.hashers.ScryptPasswordHasher",
]

# Password rules (owner's decision, 2026-11-12; ADR 0009): at least 12 characters, at least 64
# allowed, no composition rules, blocklist of common passwords, similarity to account data.
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 12},
    },
    {"NAME": "apps.accounts.validators.MaximumLengthValidator", "OPTIONS": {"max_length": 256}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

AUTHENTICATION_BACKENDS = [
    "django.contrib.auth.backends.ModelBackend",
    "allauth.account.auth_backends.AuthenticationBackend",
]

# --- django-allauth (headless, browser sessions; ADR 0004, decisions D/L/M in OPEN-QUESTIONS) ---
HEADLESS_ONLY = True
HEADLESS_CLIENTS = ("browser",)  # no token-based app clients
ACCOUNT_ADAPTER = "apps.accounts.adapter.AccountAdapter"
ACCOUNT_SIGNUP_FORM_CLASS = "apps.accounts.forms.SignupForm"
# Signup can be closed (e.g. closed beta); off unless explicitly enabled.
SIGNUP_ENABLED = env_bool("DJANGO_SIGNUP_ENABLED", False)
ACCOUNT_LOGIN_METHODS = {"email"}
ACCOUNT_SIGNUP_FIELDS = ["email*", "username*", "password1*"]
ACCOUNT_UNIQUE_EMAIL = True
ACCOUNT_PRESERVE_USERNAME_CASING = False
ACCOUNT_USERNAME_MIN_LENGTH = 3
ACCOUNT_EMAIL_VERIFICATION = "mandatory"
ACCOUNT_EMAIL_CONFIRMATION_EXPIRE_DAYS = 3
# Never reveal whether an email address has an account (signup, login, password reset).
ACCOUNT_PREVENT_ENUMERATION = True
# Do not send mail to addresses without an account (abuse: mail bombing via password reset).
ACCOUNT_EMAIL_UNKNOWN_ACCOUNTS = False
ACCOUNT_LOGIN_ON_EMAIL_CONFIRMATION = False
ACCOUNT_LOGIN_ON_PASSWORD_RESET = False
ACCOUNT_SESSION_REMEMBER = True
# Security notifications by email (password changed, second factor added or removed, ...), so an
# account owner notices changes made by someone else.
ACCOUNT_EMAIL_NOTIFICATIONS = True
ACCOUNT_EMAIL_SUBJECT_PREFIX = f"[{PLATFORM_NAME}] "


def _usernames_reserved() -> list[str]:
    from apps.accounts.validators import RESERVED_USERNAMES

    return [*RESERVED_USERNAMES, PLATFORM_NAME.lower()]


ACCOUNT_USERNAME_BLACKLIST = _usernames_reserved()
# Changing security settings (2FA, password) requires a login within the last 5 minutes.
ACCOUNT_REAUTHENTICATION_TIMEOUT = 300
# Only password or a second factor confirm such changes, not an emailed code (whoever controls
# the mailbox must not be able to change the second factor).
ACCOUNT_REAUTHENTICATION_METHODS = ["password", "mfa"]

# --- Two-factor authentication (optional for users; owner's decision 2026-11-12) ---
MFA_ADAPTER = "apps.accounts.adapter.MFAAdapter"
MFA_SUPPORTED_TYPES = ["totp", "recovery_codes", "webauthn"]
MFA_PASSKEY_LOGIN_ENABLED = True
MFA_RECOVERY_CODE_COUNT = 10
MFA_TOTP_TOLERANCE = 1  # one 30-second step of clock drift


# Links in emails point to the SSR frontend, never to Django.
# "localhost", not 127.0.0.1: WebAuthn (passkeys) does not accept IP addresses as relying party.
FRONTEND_URL = env_str("FRONTEND_URL", "http://localhost:5173").rstrip("/")
HEADLESS_FRONTEND_URLS = {
    "account_confirm_email": f"{FRONTEND_URL}/verify-email/{{key}}",
    "account_reset_password": f"{FRONTEND_URL}/password/forgot",
    "account_reset_password_from_key": f"{FRONTEND_URL}/password/reset/{{key}}",
    "account_signup": f"{FRONTEND_URL}/signup",
}


# --- Email: provider-neutral SMTP via MAILERS (Django 6.1; the EMAIL_* settings are deprecated).
# Provider: open question F (proposal Scaleway). Development: Mailpit on 127.0.0.1:1025.
def smtp_mailer(*, host: str, port: int, use_tls: bool) -> dict:
    return {
        "BACKEND": "django.core.mail.backends.smtp.EmailBackend",
        "OPTIONS": {
            "host": host,
            "port": port,
            "username": env_str("DJANGO_EMAIL_HOST_USER", "") or None,
            "password": env_str("DJANGO_EMAIL_HOST_PASSWORD", "") or None,
            "use_tls": use_tls,
            "timeout": 10,
        },
    }


MAILERS = {
    "default": smtp_mailer(
        host=env_str("DJANGO_EMAIL_HOST", "127.0.0.1"),
        port=env_int("DJANGO_EMAIL_PORT", 1025),
        use_tls=env_bool("DJANGO_EMAIL_USE_TLS", False),
    )
}
DEFAULT_FROM_EMAIL = env_str("DJANGO_DEFAULT_FROM_EMAIL", f"{PLATFORM_NAME} <no-reply@localhost>")

# Origins whose POST requests pass Django's CSRF origin check (e.g. the SSR frontend).
CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS", [])

# Test-only probe for the SSR spike (WP 0.4). Never installed in production.
ENABLE_SSR_PROBE = False

# For third-party models; our own models use UUIDv4 (see apps.core.models).
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- Internationalization ---
LANGUAGE_CODE = "en"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# --- Uploaded files (avatars). Stored outside any web root and NEVER served directly: there is
# no MEDIA_URL route; Django views check permissions and serve files (docs/SECURITY.md, "Uploads").
MEDIA_ROOT = Path(env_str("DJANGO_MEDIA_ROOT", str(BASE_DIR / "media")))
STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
        "OPTIONS": {"location": MEDIA_ROOT, "base_url": None},
    },
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}
FILE_UPLOAD_PERMISSIONS = 0o640
FILE_UPLOAD_DIRECTORY_PERMISSIONS = 0o750

# --- Security baseline (applies everywhere; prod.py tightens it) ---
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
    # Secure default: everything requires authentication; public endpoints opt out explicitly.
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
    ],
    # Rates for views that opt in with ScopedRateThrottle (cache-based, see open question O).
    "DEFAULT_THROTTLE_RATES": {
        "avatar_upload": "10/hour",
    },
}

SPECTACULAR_SETTINGS = {
    "TITLE": f"{PLATFORM_NAME} API",
    "VERSION": "0.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
}

# The schema endpoint is only served in development (see dev.py / config/urls.py).
SERVE_API_SCHEMA = False

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}
