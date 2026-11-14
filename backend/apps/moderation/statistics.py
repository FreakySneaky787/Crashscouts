"""Moderation statistics for admins (WP 7.4, ADR 0029): sums per calendar month (UTC), never
single cases or people. Computed from the moderation tables at request time; no extra storage."""

from datetime import UTC, datetime, timedelta

from django.db.models import Avg, Count, F, Q
from django.db.models.functions import TruncMonth
from django.utils import timezone

from .models import OPEN_STATES, AccountSuspension, Block, ModeratorAccess, Report

MONTHS = 12


def _month_starts(now: datetime, months: int) -> list[datetime]:
    first = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    starts = [first]
    for _ in range(months - 1):
        first = (first - timedelta(days=1)).replace(day=1)
        starts.append(first)
    return sorted(starts)


def _per_month(queryset, field: str, since, **aggregates) -> dict:
    rows = (
        queryset.filter(**{f"{field}__gte": since})
        .annotate(month=TruncMonth(field, tzinfo=UTC))
        .values("month")
        .annotate(**aggregates)
    )
    return {row["month"].date().isoformat(): row for row in rows}


def _counts_by(queryset, field: str, key: str, since) -> dict:
    rows = (
        queryset.filter(**{f"{field}__gte": since})
        .annotate(month=TruncMonth(field, tzinfo=UTC))
        .values("month", key)
        .annotate(n=Count("id"))
    )
    result: dict = {}
    for row in rows:
        month = row["month"].date().isoformat()
        result.setdefault(month, {})[row[key]] = row["n"]
    return result


def statistics(now: datetime | None = None, months: int = MONTHS) -> dict:
    now = now or timezone.now()
    starts = _month_starts(now, months)
    since = starts[0]
    created = _per_month(Report.objects.all(), "created_at", since, n=Count("id"))
    by_reason = _counts_by(Report.objects.all(), "created_at", "reason", since)
    by_target = _counts_by(Report.objects.all(), "created_at", "target_type", since)
    closed = _per_month(
        Report.objects.filter(closed_at__isnull=False),
        "closed_at",
        since,
        resolved=Count("id", filter=Q(status=Report.Status.RESOLVED)),
        dismissed=Count("id", filter=Q(status=Report.Status.DISMISSED)),
        mean=Avg(F("closed_at") - F("created_at")),
    )
    blocks = _per_month(Block.objects.all(), "created_at", since, n=Count("id"))
    block_appeals = _per_month(
        Block.objects.filter(appealed_at__isnull=False), "appealed_at", since, n=Count("id")
    )
    suspensions = _per_month(
        AccountSuspension.objects.all(),
        "created_at",
        since,
        n=Count("id"),
        permanent=Count("id", filter=Q(ends_at__isnull=True)),
    )
    suspension_appeals = _per_month(
        AccountSuspension.objects.filter(appealed_at__isnull=False),
        "appealed_at",
        since,
        n=Count("id"),
    )
    decided = _per_month(
        AccountSuspension.objects.filter(appeal_decided_at__isnull=False),
        "appeal_decided_at",
        since,
        lifted=Count("id", filter=Q(appeal_decision=AccountSuspension.Decision.LIFTED)),
        upheld=Count("id", filter=Q(appeal_decision=AccountSuspension.Decision.UPHELD)),
    )
    accesses = _per_month(ModeratorAccess.objects.all(), "created_at", since, n=Count("id"))

    def hours(value) -> float | None:
        return None if value is None else round(value.total_seconds() / 3600, 1)

    rows = []
    for start in reversed(starts):
        month = start.date().isoformat()
        closed_row = closed.get(month, {})
        decided_row = decided.get(month, {})
        rows.append(
            {
                "month": month,
                "reports": created.get(month, {}).get("n", 0),
                "by_reason": by_reason.get(month, {}),
                "by_target": by_target.get(month, {}),
                "resolved": closed_row.get("resolved", 0),
                "dismissed": closed_row.get("dismissed", 0),
                "hours_to_decision": hours(closed_row.get("mean")),
                "blocks": blocks.get(month, {}).get("n", 0),
                "block_appeals": block_appeals.get(month, {}).get("n", 0),
                "suspensions": suspensions.get(month, {}).get("n", 0),
                "permanent_suspensions": suspensions.get(month, {}).get("permanent", 0),
                "suspension_appeals": suspension_appeals.get(month, {}).get("n", 0),
                "appeals_lifted": decided_row.get("lifted", 0),
                "appeals_upheld": decided_row.get("upheld", 0),
                "accesses": accesses.get(month, {}).get("n", 0),
            }
        )
    open_reports = Report.objects.filter(status__in=OPEN_STATES)
    open_cases = sum(
        open_reports.filter(target_type=kind).values(kind).distinct().count()
        for kind in Report.TargetType.values
    )
    return {
        "generated_at": now.isoformat(),
        "now": {
            "open_cases": open_cases,
            "open_reports": open_reports.count(),
            "active_blocks": Block.objects.filter(lifted_at__isnull=True).count(),
            "open_appeals": Block.objects.filter(
                appealed_at__isnull=False, appeal_decision=""
            ).count()
            + AccountSuspension.objects.filter(
                appealed_at__isnull=False, appeal_decision="", lifted_at__isnull=True
            ).count(),
        },
        "months": rows,
    }
