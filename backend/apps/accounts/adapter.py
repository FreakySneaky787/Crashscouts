"""django-allauth adapter: project-specific account rules."""

from dataclasses import dataclass
from urllib.parse import urlsplit

from allauth.account.adapter import DefaultAccountAdapter
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
        super().send_mail(template_prefix, email, {**context, "current_site": platform_site()})
