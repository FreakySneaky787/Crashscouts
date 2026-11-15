"""Growth metrics (WP M.1, ADR 0030, docs/METRICS.md) with fixed example data per metric."""

from datetime import UTC, datetime, timedelta

import pytest

from apps.campaigns import status
from apps.campaigns.models import Campaign, Participation
from apps.campaigns.tests.test_campaigns import make_campaign
from apps.feedback.models import Feedback
from apps.metrics.queries import metrics
from apps.moderation.tests.test_moderation import moderator
from apps.projects.tests.test_projects import client_for, make_user, new_project

NOW = datetime(2026, 11, 15, 12, 0, tzinfo=UTC)
OCT = datetime(2026, 10, 5, 10, 0, tzinfo=UTC)
NOV = datetime(2026, 11, 2, 10, 0, tzinfo=UTC)


def published(project, slug, at, state=status.PUBLISHED, by=None):
    campaign = make_campaign(project, state, "public", slug=slug)
    Campaign.objects.filter(pk=campaign.pk).update(published_at=at, published_by=by)
    return campaign


def join(campaign, user, at, state=Participation.Status.ACTIVE):
    found = Participation.objects.create(campaign=campaign, user=user, status=state)
    Participation.objects.filter(pk=found.pk).update(created_at=at)


def feedback(campaign, author, state):
    Feedback.objects.create(
        campaign=campaign, author=author, kind="general", title="x", description="x", status=state
    )


@pytest.fixture
def data(db):
    dev = make_user("mt-dev")
    other_dev = make_user("mt-dev-2")
    project = new_project(dev, "mt-app", "public")
    ann, ben, cat = (make_user(f"mt-{n}") for n in ("ann", "ben", "cat"))
    # October: three campaigns by "dev" (twice) and "other_dev" (once).
    a = published(project, "a", OCT, status.COMPLETED, by=dev)
    b = published(project, "b", OCT, status.CANCELLED, by=dev)
    c = published(project, "c", OCT + timedelta(days=1), status.COMPLETED, by=other_dev)
    join(a, ann, OCT + timedelta(hours=2))  # first tester of a after 2 h
    join(a, ben, OCT + timedelta(hours=30))
    join(b, ann, OCT + timedelta(hours=10), Participation.Status.LEFT)  # left still counts
    join(c, cat, OCT + timedelta(days=1, hours=1), Participation.Status.REMOVED)  # never counts
    feedback(a, ann, Feedback.Status.NEW)  # useful (not turned down)
    feedback(c, cat, Feedback.Status.DUPLICATE)  # not useful
    # November: one running campaign by a deleted publisher, no testers yet.
    published(project, "d", NOV, status.PUBLISHED, by=None)
    return {"dev": dev}


def test_time_to_first_tester(data):
    result = metrics(now=NOW)
    october = result["months"][1]
    assert october["month"] == "2026-10-01"
    figure = october["time_to_first_tester"]
    # a: 2 h, b: 10 h (left counts), c: only a removed participation -> no tester.
    assert figure == {
        "campaigns": 3,
        "median_hours": 6.0,
        "without_tester": 1,
        "without_tester_share": round(1 / 3, 4),
    }
    november = result["months"][0]["time_to_first_tester"]
    assert (november["median_hours"], november["without_tester_share"]) == (None, 1.0)


def test_completion_and_useful_feedback(data):
    october = metrics(now=NOW)["months"][1]
    assert october["completion_rate"] == {"completed": 2, "ended": 3, "rate": round(2 / 3, 4)}
    # a has a new feedback (useful), c only a duplicate.
    assert october["useful_feedback_rate"] == {
        "with_useful_feedback": 1,
        "completed": 2,
        "rate": 0.5,
    }
    november = metrics(now=NOW)["months"][0]
    assert november["completion_rate"]["rate"] is None  # nothing ended yet: no share
    assert november["useful_feedback_rate"]["rate"] is None


def test_returning_testers_and_developers(data):
    result = metrics(now=NOW)
    # ann: campaigns a and b (2), ben: a (1); cat only removed -> not a tester.
    assert result["all_time"]["returning_testers"] == {"people": 2, "returning": 1, "rate": 0.5}
    assert result["months"][1]["returning_testers"] == {"people": 2, "returning": 1, "rate": 0.5}
    # dev: 2 campaigns, other_dev: 1; the deleted publisher (NULL) does not count.
    assert result["all_time"]["returning_developers"] == {
        "people": 2,
        "returning": 1,
        "rate": 0.5,
    }
    assert result["months"][0]["returning_developers"]["people"] == 0


def test_twelve_months_and_nothing_but_numbers(data):
    result = metrics(now=NOW)
    assert len(result["months"]) == 12
    assert result["all_time"]["time_to_first_tester"]["campaigns"] == 4
    text = str(result)
    for name in ("mt-dev", "mt-ann", "mt-app"):
        assert name not in text


def test_empty_platform(db):
    result = metrics(now=NOW)
    assert result["all_time"]["completion_rate"] == {"completed": 0, "ended": 0, "rate": None}
    assert result["all_time"]["returning_testers"]["rate"] is None


def test_admins_only(data):
    url = "/api/v1/platform/metrics/"
    for user in (moderator("mt-mod"), make_user("mt-stranger"), None):
        assert client_for(user).get(url).status_code in {401, 403, 404}
    admin = moderator("mt-admin")
    admin.platform_role = "admin"
    admin.save()
    response = client_for(admin).get(url)
    assert response.status_code == 200
    assert response["Cache-Control"] == "private, no-store"
    assert response.json()["all_time"]["returning_developers"]["people"] == 2


@pytest.mark.parametrize(
    "turned_down",
    [Feedback.Status.DUPLICATE, Feedback.Status.CANNOT_REPRODUCE, Feedback.Status.REJECTED],
)
def test_turned_down_feedback_is_not_useful(db, turned_down):
    dev, tester = make_user("mt-td-dev"), make_user("mt-td-tester")
    campaign = published(new_project(dev, "mt-td", "public"), "x", OCT, status.COMPLETED, by=dev)
    feedback(campaign, tester, turned_down)
    rate = metrics(now=NOW)["all_time"]["useful_feedback_rate"]
    assert rate == {"with_useful_feedback": 0, "completed": 1, "rate": 0.0}
    feedback(campaign, tester, Feedback.Status.FIXED)  # one useful feedback is enough
    assert metrics(now=NOW)["all_time"]["useful_feedback_rate"]["rate"] == 1.0
