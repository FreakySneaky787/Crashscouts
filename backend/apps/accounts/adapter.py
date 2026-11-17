"""django-allauth adapter: project-specific account rules."""

import logging
from dataclasses import dataclass
from urllib.parse import urlsplit

from allauth.account.adapter import DefaultAccountAdapter
from allauth.mfa.adapter import DefaultMFAAdapter
from django.conf import settings
from django.core.cache import cache
from django.core.mail import mail_admins
from django.utils import timezone

logger = logging.getLogger(__name__)
DAY_SECONDS = 24 * 60 * 60


@dataclass(frozen=True)
class PlatformSite:
    """Stands in for django.contrib.sites in emails: the public name and the frontend's host,
    never the internal backend host the SSR server talks to."""

    name: str
    domain: str


def platform_site() -> PlatformSite:
    return PlatformSite(name=settings.PLATFORM_NAME, domain=urlsplit(settings.FRONTEND_URL).netloc)


def account_email_allowed() -> bool:
    """Counts account emails per UTC day against ACCOUNT_EMAIL_DAILY_LIMIT. Returns False once the
    limit is used up; on the first refusal of the day the owner gets one error email (no address,
    no content, so no personal data)."""
    key = f"account-mail:{timezone.now().date().isoformat()}"
    cache.add(key, 0, timeout=DAY_SECONDS)
    try:
        count = cache.incr(key)
    except ValueError:  # expired between add and incr
        cache.set(key, 1, timeout=DAY_SECONDS)
        count = 1
    limit = settings.ACCOUNT_EMAIL_DAILY_LIMIT
    if count <= limit:
        return True
    if count == limit + 1:
        logger.error(
            "Daily limit of %s account emails reached; further ones are dropped today.", limit
        )
        if settings.ADMINS:
            mail_admins(
                "Daily limit for account emails reached",
                f"{limit} account emails (confirmation, password reset) were sent today. Further "
                "ones are dropped until 00:00 UTC. A wave of sign-ups or an attack? Check the "
                "server logs and the sign-ups (docs/OPERATIONS.md section 13).",
            )
    return False


class AccountAdapter(DefaultAccountAdapter):
    def is_open_for_signup(self, request) -> bool:
        # Signup can be switched off entirely (e.g. closed beta) via DJANGO_SIGNUP_ENABLED.
        return settings.SIGNUP_ENABLED

    def clean_username(self, username: str, shallow: bool = False) -> str:
        # Usernames are stored lowercase; "Alice" and "alice" are the same handle.
        return super().clean_username(username.strip().lower(), shallow=shallow)

    def send_mail(self, template_prefix: str, email: str, context: dict) -> None:
        # Built here instead of in allauth: no lookup of the request's host (internal backend
        # host, and no request at all for mails sent after a transaction commit).
        ctx = {"email": email, **context, "current_site": platform_site()}
        # allauth's own emails (templates "account/...", "mfa/...") are the ones anyone can
        # trigger without a confirmed account; they share a daily ceiling (owner's decision
        # 2026-11-17). Platform notifications need a confirmed account and have their own limits.
        if template_prefix.startswith(("account/", "mfa/")) and not account_email_allowed():
            return
        self.render_mail(template_prefix, email, ctx).send()


class MFAAdapter(DefaultMFAAdapter):
    def get_public_key_credential_rp_entity(self) -> dict[str, str]:
        # WebAuthn relying party = the public frontend host the browser talks to, never the
        # internal backend host the SSR server uses (e.g. "django" inside Docker).
        return {
            "id": urlsplit(settings.FRONTEND_URL).hostname or "",
            "name": settings.PLATFORM_NAME,
        }

    def get_totp_issuer(self) -> str:
        return settings.PLATFORM_NAME
