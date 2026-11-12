"""Signing in cancels a pending account deletion (owner's decision: restorable within 14 days)."""

from django.contrib.auth import signals
from django.dispatch import receiver

from .lifecycle import cancel_deletion


@receiver(signals.user_logged_in)
def cancel_pending_deletion(sender, request, user, **kwargs):
    cancel_deletion(user)
