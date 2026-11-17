"""Error emails without personal data (WP 8.4, ADR 0034).

Django's own AdminEmailHandler sends the full request: cookies, headers, the client IP and the
POST data. This handler sends only what is needed to find the bug:

- the URL pattern of the view (``api/projects/<slug>/``), never the requested path, which may
  contain a user name;
- the exception class, never its message, which may contain user data (for example an
  IntegrityError quoting an email address);
- the stack frames (file, line, function), never local variables.

At most ``ERROR_MAIL_DAILY_LIMIT`` mails are sent per day, so an error loop cannot use up the
mail provider's monthly quota. The handler never raises: a failing mail must not turn into a
second error.
"""

import logging
import traceback

from django.conf import settings
from django.core.cache import cache
from django.core.mail import mail_admins
from django.utils import timezone

DAY_SECONDS = 24 * 60 * 60


def _route(request) -> str:
    match = getattr(request, "resolver_match", None)
    if match is not None and match.route:
        return match.route
    return "(no matching URL pattern)"


def _frames(exc_info) -> str:
    if not exc_info or exc_info[2] is None:
        return "  (no traceback)"
    return "\n".join(
        f"  {frame.filename}:{frame.lineno} in {frame.name}"
        for frame in traceback.extract_tb(exc_info[2])
    )


def _within_daily_limit() -> bool:
    key = f"error-mail:{timezone.now().date().isoformat()}"
    cache.add(key, 0, timeout=DAY_SECONDS)
    try:
        count = cache.incr(key)
    except ValueError:  # expired between add and incr
        cache.set(key, 1, timeout=DAY_SECONDS)
        count = 1
    return count <= settings.ERROR_MAIL_DAILY_LIMIT


def build_report(record: logging.LogRecord) -> tuple[str, str]:
    """Returns the subject and body; contains no request data and no exception message."""
    request = getattr(record, "request", None)
    route = _route(request) if request is not None else "(no request)"
    method = getattr(request, "method", "") or ""
    exc_info = record.exc_info
    error = exc_info[0].__name__ if exc_info and exc_info[0] else record.levelname
    status = getattr(record, "status_code", None)
    subject = f"{error} at {method} {route}".strip()
    body = "\n".join(
        [
            f"Error:   {error}",
            f"Route:   {method} {route}",
            f"Status:  {status if status is not None else '-'}",
            f"Time:    {timezone.now().isoformat(timespec='seconds')}",
            "",
            "Stack (most recent call last):",
            _frames(exc_info),
            "",
            "Request data and the exception message are left out on purpose (ADR 0034).",
            "Details: the server logs (docs/OPERATIONS.md §13).",
        ]
    )
    return subject, body


class MinimalAdminEmailHandler(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        try:
            if not settings.ADMINS or not _within_daily_limit():
                return
            subject, body = build_report(record)
            mail_admins(subject, body)
        except Exception:  # logging must never fail the request
            self.handleError(record)
