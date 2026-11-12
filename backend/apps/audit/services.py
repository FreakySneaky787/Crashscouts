"""The only way to write audit log entries."""

from collections.abc import Mapping

from .models import AuditEvent


def record(
    kind: str, *, actor=None, subject=None, data: Mapping[str, object] | None = None
) -> AuditEvent:
    """Store one audit event. ``data`` must not contain secrets or personal data."""
    actor = actor if getattr(actor, "is_authenticated", False) else None
    return AuditEvent.objects.create(kind=kind, actor=actor, subject=subject, data=dict(data or {}))
