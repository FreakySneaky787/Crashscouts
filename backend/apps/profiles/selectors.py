"""Read access to profiles. Visibility rules live here, not in views."""

from allauth.account.models import EmailAddress
from django.db.models import Exists, OuterRef, QuerySet

from .models import Profile


def visible_profiles() -> QuerySet[Profile]:
    """Profiles that may be shown publicly: active accounts with a confirmed email address.

    Unconfirmed accounts stay invisible (no public pages for throwaway or spam signups);
    deactivated accounts and accounts waiting for deletion disappear at once.
    """
    confirmed = EmailAddress.objects.filter(user=OuterRef("user"), verified=True)
    return (
        Profile.objects.filter(user__is_active=True, user__deletion_scheduled_for__isnull=True)
        .filter(Exists(confirmed))
        .select_related("user")
        .prefetch_related("interests", "platforms", "skills")
    )


def profile_for(user) -> Profile:
    """The user's own profile; created on demand for accounts that predate profiles."""
    profile, _ = Profile.objects.get_or_create(user=user)
    return profile
