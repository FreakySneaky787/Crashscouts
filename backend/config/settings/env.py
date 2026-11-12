"""Kleine, abhängigkeitsfreie Helfer zum Lesen der Konfiguration aus Umgebungsvariablen.

Konfiguration kommt ausschliesslich aus der Umgebung (nie aus dem Repository).
Fehlende Pflichtwerte führen zu einem klaren Fehler beim Start statt zu unsicheren Standardwerten.
"""

import os

from django.core.exceptions import ImproperlyConfigured


def env_str(name: str, default: str | None = None) -> str:
    value = os.environ.get(name)
    if value is None or value == "":
        if default is None:
            raise ImproperlyConfigured(
                f"Umgebungsvariable {name} fehlt. "
                "Siehe .env.example im Repository-Wurzelverzeichnis."
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
    raise ImproperlyConfigured(f"Umgebungsvariable {name} muss true/false sein, nicht {value!r}.")


def env_int(name: str, default: int) -> int:
    value = os.environ.get(name)
    if value is None or value == "":
        return default
    try:
        return int(value)
    except ValueError as exc:
        raise ImproperlyConfigured(f"Umgebungsvariable {name} muss eine Ganzzahl sein.") from exc


def env_list(name: str, default: list[str] | None = None) -> list[str]:
    value = os.environ.get(name)
    if value is None or value.strip() == "":
        if default is None:
            raise ImproperlyConfigured(f"Umgebungsvariable {name} fehlt.")
        return default
    return [item.strip() for item in value.split(",") if item.strip()]
