"""Sicherheits-Standards, die ab dem ersten Tag gelten müssen."""

import pytest
from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework.permissions import IsAuthenticated


def test_api_requires_authentication_by_default():
    assert settings.REST_FRAMEWORK["DEFAULT_PERMISSION_CLASSES"] == [
        "rest_framework.permissions.IsAuthenticated"
    ]
    assert IsAuthenticated  # Klasse existiert und ist importierbar


def test_browsable_api_not_enabled_outside_development():
    assert settings.REST_FRAMEWORK["DEFAULT_RENDERER_CLASSES"] == [
        "rest_framework.renderers.JSONRenderer"
    ]


@pytest.mark.django_db
def test_schema_endpoint_not_served_outside_development(api_client):
    assert settings.SERVE_API_SCHEMA is False
    response = api_client.get("/api/v1/schema/")
    assert response.status_code == 404


@pytest.mark.django_db
def test_security_headers_present(api_client):
    response = api_client.get("/api/v1/health/")

    assert response["X-Content-Type-Options"] == "nosniff"
    assert response["X-Frame-Options"] == "DENY"
    assert response["Referrer-Policy"] == "same-origin"
    assert response["Cross-Origin-Opener-Policy"] == "same-origin"


def test_argon2_is_primary_password_hasher():
    assert settings.PASSWORD_HASHERS[0] == "django.contrib.auth.hashers.Argon2PasswordHasher"


def test_custom_user_model_is_active():
    assert settings.AUTH_USER_MODEL == "accounts.User"
    assert get_user_model()._meta.label == "accounts.User"


def test_only_postgresql_is_used():
    assert settings.DATABASES["default"]["ENGINE"] == "django.db.backends.postgresql"
