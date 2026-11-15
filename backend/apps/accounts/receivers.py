"""Signing in cancels a pending account deletion (owner's decision: restorable within 14 days).
GitHub sign-in keeps only the profile data the platform needs (question Z)."""

from allauth.socialaccount.models import SocialAccount
from django.contrib.auth import signals
from django.db.models.signals import pre_save
from django.dispatch import receiver

from .lifecycle import cancel_deletion
from .socialdata import minimal_github_data


@receiver(signals.user_logged_in)
def cancel_pending_deletion(sender, request, user, **kwargs):
    cancel_deletion(user)


@receiver(pre_save, sender=SocialAccount)
def keep_only_needed_github_data(sender, instance, **kwargs):
    if instance.provider == "github":
        instance.extra_data = minimal_github_data(instance.extra_data)
