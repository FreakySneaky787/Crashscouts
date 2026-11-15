"""Load tests on the local production-like stack only (WP 8.6, docs/PERFORMANCE.md).

Production settings with one change: the Discover limit per IP address is lifted, because all
simulated users share one address locally (real visitors do not). Refuses to start for anything
but https://localhost, so it cannot end up on a real server. Selected only by
compose.loadtest.yaml.
"""

from django.core.exceptions import ImproperlyConfigured

from .prod import *  # noqa: F403

if FRONTEND_URL != "https://localhost":  # noqa: F405
    raise ImproperlyConfigured("config.settings.loadtest is for the local test stack only.")

# Local test stack only: the generated campaigns are public, and the gate would hide them. This
# never applies to a real server (see the check above); there only the owner opens the gate.
PUBLIC_CAMPAIGNS_ENABLED = True

REST_FRAMEWORK = {
    **REST_FRAMEWORK,  # noqa: F405
    "DEFAULT_THROTTLE_RATES": {
        **REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"],  # noqa: F405
        "discover_ip": "100000/min",
    },
}
