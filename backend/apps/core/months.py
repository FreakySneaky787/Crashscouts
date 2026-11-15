"""Calendar months in UTC for statistics pages (WP 7.4, WP M.1)."""

from datetime import UTC, datetime, timedelta


def month_starts(now: datetime, months: int) -> list[datetime]:
    """The first moments (UTC) of the last ``months`` calendar months, oldest first, including the
    current month."""
    first = now.astimezone(UTC).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    starts = [first]
    for _ in range(months - 1):
        first = (first - timedelta(days=1)).replace(day=1)
        starts.append(first)
    return sorted(starts)


def month_key(moment: datetime) -> str:
    """The month a moment falls into, as "YYYY-MM-01" (UTC)."""
    return moment.astimezone(UTC).strftime("%Y-%m-01")
