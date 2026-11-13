"""Cache key function (WP 3B.5, ADR 0022).

Every cache key is replaced by an HMAC (SHA-256, keyed with SECRET_KEY), so the shared database
cache never stores a key in plain text, in particular no IP address from the rate limits of
allauth (``allauth:rl:…:ip:<ip>``) or DRF (``throttle_…_<ip>``). Owner's decision (2026-11-13):
IP addresses only as a keyed hash, for at most one day (the longest rate-limit window).
"""

from django.utils.crypto import salted_hmac


def hashed_key(key: str, key_prefix: str, version: int) -> str:
    digest = salted_hmac("cache-key", key, algorithm="sha256").hexdigest()
    return f"{key_prefix}:{version}:{digest}"
