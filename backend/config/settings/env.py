"""Small, dependency-free helpers for reading configuration from environment variables.

Configuration comes exclusively from the environment (never from the repository).
Missing required values fail loudly at startup instead of falling back to insecure defaults.
"""

import os

from django.core.exceptions import ImproperlyConfigured


def env_str(name: str, default: str | None = None) -> str:
    value = os.environ.get(name)
    if value is None or value == "":
        if default is None:
            raise ImproperlyConfigured(
                f"Environment variable {name} is missing. See .env.example in the repository root."
            )
        return default
    return value


def env_bool(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None or value == "":
        return default
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise ImproperlyConfigured(f"Environment variable {name} must be true/false, not {value!r}.")


def env_int(name: str, default: int) -> int:
    value = os.environ.get(name)
    if value is None or value == "":
        return default
    try:
        return int(value)
    except ValueError as exc:
        raise ImproperlyConfigured(f"Environment variable {name} must be an integer.") from exc


def env_list(name: str, default: list[str] | None = None) -> list[str]:
    value = os.environ.get(name)
    if value is None or value.strip() == "":
        if default is None:
            raise ImproperlyConfigured(f"Environment variable {name} is missing.")
        return default
    return [item.strip() for item in value.split(",") if item.strip()]
