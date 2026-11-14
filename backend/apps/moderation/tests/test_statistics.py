"""Moderation statistics (WP 7.4, ADR 0029): sums per month from fixed example data; admins
only; no names of people or cases."""

from datetime import UTC, datetime, timedelta

import pytest

from apps.moderation.models import AccountSuspension, Block, ModeratorAccess, Report
from apps.moderation.statistics import statistics
from apps.projects.tests.test_projects import client_for, make_user, new_project

from .test_moderation import moderator

NOW = datetime(2026, 11, 14, 12, 0, tzinfo=UTC)
OCT = datetime(2026, 10, 10, 9, 0, tzinfo=UTC)


def at(obj, **times):
    type(obj).objects.filter(pk=obj.pk).update(**times)


@pytest.fixture
def data(db):
    owner = make_user("st-owner")
    project = new_project(owner, "st-app", "public")
    person = make_user("st-person")
    reporters = [make_user(f"st-rep-{i}") for i in range(3)]

    def report(target_type, reason, reporter, **target):
        return Report.objects.create(
            target_type=target_type, target_label="x", reporter=reporter, reason=reason, **target
        )

    # October: two reports, one resolved after 10 hours, one dismissed after 30 hours.
    first = report("project", "spam", reporters[0], project=project)
    at(first, created_at=OCT, status="resolved", closed_at=OCT + timedelta(hours=10))
    second = report("user", "harassment", reporters[1], user=person)
    at(second, created_at=OCT, status="dismissed", closed_at=OCT + timedelta(hours=30))
    # November: one open report, a block with an appeal, a permanent suspension whose appeal
    # was accepted, and one moderator access.
    third = report("project", "malware", reporters[2], project=project)
    at(third, created_at=NOW - timedelta(days=1))
    block = Block.objects.create(
        target_type="project", project=project, category="spam", message="x"
    )
    at(block, created_at=NOW - timedelta(days=2), appealed_at=NOW - timedelta(days=1))
    suspension = AccountSuspension.objects.create(user=person, category="spam", message="x")
    at(
        suspension,
        created_at=NOW - timedelta(days=3),
        appealed_at=NOW - timedelta(days=2),
        appeal_decided_at=NOW - timedelta(days=1),
        appeal_decision="lifted",
        lifted_at=NOW - timedelta(days=1),
    )
    access = ModeratorAccess.objects.create(
        target_type="project", project=project, target_label="x", reason="x", expires_at=NOW
    )
    at(access, created_at=NOW - timedelta(hours=5))


def test_sums_per_month(data):
    result = statistics(now=NOW)
    november, october = result["months"][0], result["months"][1]
    assert len(result["months"]) == 12
    assert (november["month"], october["month"]) == ("2026-11-01", "2026-10-01")
    assert october["reports"] == 2
    assert october["by_reason"] == {"spam": 1, "harassment": 1}
    assert october["by_target"] == {"project": 1, "user": 1}
    assert (october["resolved"], october["dismissed"]) == (1, 1)
    assert october["hours_to_decision"] == 20.0  # mean of 10 and 30 hours
    assert november["reports"] == 1
    assert november["by_reason"] == {"malware": 1}
    assert november["hours_to_decision"] is None  # nothing decided in November
    assert (november["blocks"], november["block_appeals"]) == (1, 1)
    assert (november["suspensions"], november["permanent_suspensions"]) == (1, 1)
    assert november["suspension_appeals"] == 1
    assert (november["appeals_lifted"], november["appeals_upheld"]) == (1, 0)
    assert november["accesses"] == 1
    assert result["now"] == {
        "open_cases": 1,
        "open_reports": 1,
        "active_blocks": 1,
        "open_appeals": 1,  # the block's appeal is still open
    }
    assert all(m["reports"] == 0 for m in result["months"][2:])


def test_only_sums_reach_the_page(data):
    text = str(statistics(now=NOW))
    for name in ("st-owner", "st-person", "st-rep-0", "st-app"):
        assert name not in text


def test_admins_only(data):
    url = "/api/v1/moderation/statistics/"
    for user in (moderator("st-mod"), make_user("st-stranger"), None):
        assert client_for(user).get(url).status_code in {401, 403, 404}
    admin = moderator("st-admin")
    admin.platform_role = "admin"
    admin.save()
    response = client_for(admin).get(url)
    assert response.status_code == 200
    assert response["Cache-Control"] == "private, no-store"
    assert len(response.json()["months"]) == 12
