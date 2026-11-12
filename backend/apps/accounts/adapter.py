"""django-allauth adapter: project-specific account rules."""

from dataclasses import dataclass
from urllib.parse import urlsplit

from allauth.account.adapter import DefaultAccountAdapter
from allauth.mfa.adapter import DefaultMFAAdapter
from django.conf import settings


@dataclass(frozen=True)
class PlatformSite:
    """Stands in for django.contrib.sites in emails: the public name and the frontend's host,
    never the internal backend host the SSR server talks to."""

    name: str
    domain: str


def platform_site() -> PlatformSite:
    return PlatformSite(name=settings.PLATFORM_NAME, domain=urlsplit(settings.FRONTEND_URL).netloc)


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
