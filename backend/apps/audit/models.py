"""Append-only audit log of security-relevant events (docs/SECURITY.md, "Audit").

Rules:
- Entries are only ever created. Updating or deleting them through the ORM raises an error.
- No secrets and as little personal data as possible: no passwords, tokens, typed-in email
  addresses or IP addresses (open question T). References to users are set to NULL when an account
  is finally deleted; the event itself remains.
"""

import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


class AuditLogImmutableError(Exception):
    """Raised on any attempt to change or delete audit log entries."""


class AuditEventQuerySet(models.QuerySet):
    def update(self, **kwargs):
        raise AuditLogImmutableError("Audit log entries cannot be changed.")

    def delete(self):
        raise AuditLogImmutableError("Audit log entries cannot be deleted.")


class AuditEvent(models.Model):
    class Kind(models.TextChoices):
        SIGNUP = "account.signup", "Account created"
        EMAIL_CONFIRMED = "account.email_confirmed", "Email address confirmed"
        LOGIN = "auth.login", "Signed in"
        LOGIN_FAILED = "auth.login_failed", "Failed sign-in"
        LOGOUT = "auth.logout", "Signed out"
        PASSWORD_CHANGED = "auth.password_changed", "Password changed"
        PASSWORD_RESET = "auth.password_reset", "Password reset"
        MFA_ADDED = "mfa.added", "Two-factor method added"
        MFA_REMOVED = "mfa.removed", "Two-factor method removed"
        MFA_RESET = "mfa.reset", "Recovery codes regenerated"
        MFA_FAILED = "mfa.failed", "Failed two-factor check"
        DELETION_REQUESTED = "account.deletion_requested", "Account deletion requested"
        DELETION_CANCELLED = "account.deletion_cancelled", "Account deletion cancelled"
        ACCOUNT_DELETED = "account.deleted", "Account deleted"
        DATA_EXPORTED = "account.data_exported", "Personal data exported"
        PROJECT_OWNER_CHANGED = "project.owner_changed", "Project owner changed"
        PROJECT_DELETED = "project.deleted", "Project deleted"
        PROJECT_VISIBILITY_CHANGED = "project.visibility_changed", "Project visibility changed"
        PROJECT_MEMBER_ADDED = "project.member_added", "Project maintainer added"
        PROJECT_MEMBER_REMOVED = "project.member_removed", "Project maintainer removed"
        PROJECT_VERIFIED = "project.verified", "Project repository verified"
        PROJECT_VERIFICATION_FAILED = (
            "project.verification_failed",
            "Project repository verification failed",
        )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(default=timezone.now, editable=False, db_index=True)
    kind = models.CharField(max_length=64, choices=Kind.choices, db_index=True)
    # Who acted (NULL for anonymous actors or deleted accounts).
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    # Which account the event concerns (often the same as the actor).
    subject = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    # Non-personal context only (e.g. {"method": "password"}).
    data = models.JSONField(default=dict, blank=True)

    objects = AuditEventQuerySet.as_manager()

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "audit event"
        verbose_name_plural = "audit events"

    def __str__(self) -> str:
        return f"{self.created_at:%Y-%m-%d %H:%M:%S} {self.kind}"

    def save(self, *args, **kwargs) -> None:
        if not self._state.adding:
            raise AuditLogImmutableError("Audit log entries cannot be changed.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise AuditLogImmutableError("Audit log entries cannot be deleted.")
