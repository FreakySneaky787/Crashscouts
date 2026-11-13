import ipaddress
import re
from functools import cache
from urllib.parse import urlsplit
from zoneinfo import available_timezones

from django.core.exceptions import ValidationError

from apps.projects.validators import SLUG_PATTERN

RESERVED_SLUGS = {"new", "edit", "settings", "links", "apply", "join", "invitations", "team"}


def validate_campaign_slug(value: str) -> None:
    if not SLUG_PATTERN.fullmatch(value) or "--" in value:
        raise ValidationError(
            "Use 3 to 40 characters: lowercase letters, digits and single hyphens, "
            "starting and ending with a letter or digit.",
            code="invalid_slug",
        )
    if value in RESERVED_SLUGS:
        raise ValidationError("This name is reserved.", code="reserved_slug")


@cache
def _timezones() -> frozenset[str]:
    # From the tzdata package (a direct dependency), so the list does not depend on the OS.
    return frozenset(available_timezones())


def validate_timezone(value: str) -> None:
    if value not in _timezones():
        raise ValidationError("Choose a time zone from the list.", code="invalid_timezone")


# Hosts that only make sense inside a network; download links must point to the public web.
LOCAL_SUFFIXES = (
    ".local",
    ".localhost",
    ".internal",
    ".home",
    ".lan",
    ".arpa",
    ".test",
    ".invalid",
)
HOST_LABEL = re.compile(r"^(?!-)[a-z0-9-]{1,63}(?<!-)$")


def validate_download_url(value: str) -> None:
    """https only, a public host name (no IP address, no local names), no credentials.

    The server never fetches these links (no SSRF); the rules keep testers away from addresses
    that cannot be official project sources and from links that hide where they lead.
    """
    error = ValidationError("Enter a public https:// link.", code="invalid_download_url")
    if len(value) > 500 or any(c.isspace() or ord(c) < 32 for c in value):
        raise error
    try:
        parts = urlsplit(value)
        port = parts.port
    except ValueError:
        raise error from None
    host = (parts.hostname or "").rstrip(".")
    if parts.scheme != "https" or parts.username or parts.password or port not in (None, 443):
        raise error
    if not host or "." not in host or host == "localhost" or host.endswith(LOCAL_SUFFIXES):
        raise error
    try:
        ipaddress.ip_address(host.strip("[]"))
    except ValueError:
        pass
    else:
        raise error
    if not all(HOST_LABEL.fullmatch(label) for label in host.split(".")):
        raise error  # also rejects non-ASCII look-alike names; punycode (xn--) is shown as is


SHA256 = re.compile(r"^[0-9a-f]{64}$")


def normalize_sha256(value: str) -> str:
    cleaned = value.strip().lower()
    if cleaned and not SHA256.fullmatch(cleaned):
        raise ValidationError("Enter 64 hexadecimal characters.", code="invalid_sha256")
    return cleaned
