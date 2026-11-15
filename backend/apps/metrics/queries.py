"""The five growth metrics (WP M.1, docs/METRICS.md, ADR 0030).

Owner's decisions (2026-11-13): own data only, aggregates only (counts, shares, medians; never
single people), internal for platform admins, no tracking. Computed at request time from the
campaign, participation and feedback tables; no tables of their own.

Rules on top of METRICS.md:
- Only published campaigns count (``published_at`` set); the period is the month of publication
  (metrics 1 to 3) or the month of the first participation or publication (cohorts, metrics 4
  and 5).
- Participations count with status "active" or "left"; removed ones do not (metrics 1 and 4).
- Deleted accounts drop out where they are referenced (``published_by`` = NULL, participations
  deleted with the account).
- A share with a denominator of 0 is ``None`` (shown as a dash).
"""

from collections import defaultdict
from datetime import datetime
from statistics import median

from django.db.models import Exists, Min, OuterRef, Q
from django.utils import timezone

from apps.campaigns import status
from apps.campaigns.models import Campaign, Participation
from apps.core.months import month_key, month_starts
from apps.feedback.models import Feedback

MONTHS = 12
COUNTED_PARTICIPATIONS = (Participation.Status.ACTIVE, Participation.Status.LEFT)
NOT_USEFUL = (
    Feedback.Status.DUPLICATE,
    Feedback.Status.CANNOT_REPRODUCE,
    Feedback.Status.REJECTED,
)


def share(part: int, whole: int) -> float | None:
    return None if whole == 0 else round(part / whole, 4)


def _campaigns():
    useful = Feedback.objects.filter(campaign=OuterRef("pk")).exclude(status__in=NOT_USEFUL)
    return (
        Campaign.objects.filter(published_at__isnull=False)
        .annotate(
            first_tester=Min(
                "participations__created_at",
                filter=Q(participations__status__in=COUNTED_PARTICIPATIONS),
            ),
            useful=Exists(useful),
        )
        .values("published_at", "first_tester", "state", "useful")
    )


def _campaign_figures(rows: list[dict]) -> dict:
    waits = [
        (r["first_tester"] - r["published_at"]).total_seconds() / 3600
        for r in rows
        if r["first_tester"] is not None
    ]
    completed = [r for r in rows if r["state"] == status.COMPLETED]
    ended = [r for r in rows if r["state"] in (status.COMPLETED, status.CANCELLED)]
    useful = [r for r in completed if r["useful"]]
    return {
        "time_to_first_tester": {
            "campaigns": len(rows),
            "median_hours": round(median(waits), 1) if waits else None,
            "without_tester": len(rows) - len(waits),
            "without_tester_share": share(len(rows) - len(waits), len(rows)),
        },
        "completion_rate": {
            "completed": len(completed),
            "ended": len(ended),
            "rate": share(len(completed), len(ended)),
        },
        "useful_feedback_rate": {
            "with_useful_feedback": len(useful),
            "completed": len(completed),
            "rate": share(len(useful), len(completed)),
        },
    }


def _returning(first_and_count: dict[int, tuple[datetime, int]]) -> tuple[dict, dict]:
    """Overall and per-cohort share of people with at least two."""
    cohorts: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    returning = 0
    for first, count in first_and_count.values():
        cohort = cohorts[month_key(first)]
        cohort[0] += 1
        if count >= 2:
            cohort[1] += 1
            returning += 1
    total = len(first_and_count)
    overall = {"people": total, "returning": returning, "rate": share(returning, total)}
    by_cohort = {
        month: {"people": people, "returning": back, "rate": share(back, people)}
        for month, (people, back) in cohorts.items()
    }
    return overall, by_cohort


def _testers() -> dict[int, tuple[datetime, int]]:
    rows = (
        Participation.objects.filter(status__in=COUNTED_PARTICIPATIONS)
        .values("user_id")
        .annotate(first=Min("created_at"))
    )
    campaigns: dict[int, set] = defaultdict(set)
    for user_id, campaign_id in Participation.objects.filter(
        status__in=COUNTED_PARTICIPATIONS
    ).values_list("user_id", "campaign_id"):
        campaigns[user_id].add(campaign_id)
    return {r["user_id"]: (r["first"], len(campaigns[r["user_id"]])) for r in rows}


def _developers() -> dict[int, tuple[datetime, int]]:
    first: dict[int, datetime] = {}
    count: dict[int, int] = defaultdict(int)
    for user_id, published_at in Campaign.objects.filter(
        published_at__isnull=False, published_by__isnull=False
    ).values_list("published_by_id", "published_at"):
        count[user_id] += 1
        if user_id not in first or published_at < first[user_id]:
            first[user_id] = published_at
    return {user_id: (first[user_id], count[user_id]) for user_id in first}


def metrics(now: datetime | None = None, months: int = MONTHS) -> dict:
    now = now or timezone.now()
    starts = month_starts(now, months)
    rows = list(_campaigns())
    by_month: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        by_month[month_key(row["published_at"])].append(row)
    testers, tester_cohorts = _returning(_testers())
    developers, developer_cohorts = _returning(_developers())
    empty = {"people": 0, "returning": 0, "rate": None}
    month_rows = []
    for start in reversed(starts):
        month = start.date().isoformat()
        month_rows.append(
            {
                "month": month,
                **_campaign_figures(by_month.get(month, [])),
                "returning_testers": tester_cohorts.get(month, empty),
                "returning_developers": developer_cohorts.get(month, empty),
            }
        )
    return {
        "generated_at": now.isoformat(),
        "all_time": {
            **_campaign_figures(rows),
            "returning_testers": testers,
            "returning_developers": developers,
        },
        "months": month_rows,
    }
