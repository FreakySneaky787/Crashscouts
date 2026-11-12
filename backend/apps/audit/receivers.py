"""Signal receivers that turn authentication events into audit log entries."""

from allauth.account import signals as account_signals
from allauth.mfa import signals as mfa_signals
from django.contrib.auth import get_user_model
from django.contrib.auth import signals as auth_signals
from django.dispatch import receiver

from .models import AuditEvent
from .services import record


@receiver(account_signals.user_signed_up)
def on_signup(sender, request, user, **kwargs):
    record(AuditEvent.Kind.SIGNUP, actor=user, subject=user)


@receiver(account_signals.email_confirmed)
def on_email_confirmed(sender, request, email_address, **kwargs):
    record(AuditEvent.Kind.EMAIL_CONFIRMED, subject=email_address.user)


@receiver(auth_signals.user_logged_in)
def on_login(sender, request, user, **kwargs):
    record(AuditEvent.Kind.LOGIN, actor=user, subject=user)


@receiver(auth_signals.user_logged_out)
def on_logout(sender, request, user, **kwargs):
    if user is not None:
        record(AuditEvent.Kind.LOGOUT, actor=user, subject=user)


@receiver(auth_signals.user_login_failed)
def on_login_failed(sender, credentials, request=None, **kwargs):
    # The typed-in identifier is NOT stored (it may belong to nobody, or contain a password typed
    # into the wrong field). Only a matching account is referenced.
    identifier = (credentials or {}).get("email") or (credentials or {}).get("username") or ""
    subject = None
    if identifier:
        subject = get_user_model().objects.filter(email__iexact=identifier).first()
    record(AuditEvent.Kind.LOGIN_FAILED, subject=subject)


@receiver(account_signals.password_changed)
def on_password_changed(sender, request, user, **kwargs):
    record(AuditEvent.Kind.PASSWORD_CHANGED, actor=user, subject=user)


@receiver(account_signals.password_reset)
def on_password_reset(sender, request, user, **kwargs):
    record(AuditEvent.Kind.PASSWORD_RESET, subject=user)


@receiver(mfa_signals.authenticator_added)
def on_mfa_added(sender, request, user, authenticator, **kwargs):
    record(AuditEvent.Kind.MFA_ADDED, actor=user, subject=user, data={"type": authenticator.type})


@receiver(mfa_signals.authenticator_removed)
def on_mfa_removed(sender, request, user, authenticator, **kwargs):
    record(AuditEvent.Kind.MFA_REMOVED, actor=user, subject=user, data={"type": authenticator.type})


@receiver(mfa_signals.authenticator_reset)
def on_mfa_reset(sender, request, user, authenticator, **kwargs):
    record(AuditEvent.Kind.MFA_RESET, actor=user, subject=user, data={"type": authenticator.type})


@receiver(mfa_signals.authentication_failed)
def on_mfa_failed(sender, request, user, authenticator=None, **kwargs):
    data = {"type": authenticator.type} if authenticator is not None else {}
    record(AuditEvent.Kind.MFA_FAILED, subject=user, data=data)
