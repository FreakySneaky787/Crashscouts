"""Rate limits per IP address in addition to per account (WP 3B.5, gate item 3, ADR 0022)."""

from rest_framework.throttling import ScopedRateThrottle


class IPScopedRateThrottle(ScopedRateThrottle):
    """Same scope as the view's per-account throttle, counted per client address under
    ``<scope>_ip``. The address comes from DRF's ``get_ident`` (``NUM_PROXIES``) and only ever
    reaches the cache as an HMAC (config/cache.py)."""

    def allow_request(self, request, view):
        scope = getattr(view, "throttle_scope", None)
        if not scope:
            return True
        self.scope = f"{scope}_ip"
        self.rate = self.get_rate()
        self.num_requests, self.duration = self.parse_rate(self.rate)
        return super(ScopedRateThrottle, self).allow_request(request, view)

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


# Default pair for views with a throttle scope: per account (or IP when anonymous) and per IP.
USER_AND_IP = (ScopedRateThrottle, IPScopedRateThrottle)
