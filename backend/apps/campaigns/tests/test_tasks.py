"""Testing method, test tasks and progress (WP 4.1, ADR 0023)."""

import pytest
from django.core.cache import cache

from apps.accounts.lifecycle import export_data
from apps.campaigns import status
from apps.campaigns.models import Campaign, Participation, TaskProgress, TestTask
from apps.moderation.tests.test_moderation import moderator
from apps.projects.tests.test_projects import client_for, make_user, new_project

from .test_campaigns import make_campaign

BASE = "/api/v1/projects/task-app/campaigns/beta/"
TASKS = f"{BASE}tasks/"


def add_tasks(campaign, *titles):
    return [
        TestTask.objects.create(campaign=campaign, title=title, position=n)
        for n, title in enumerate(titles)
    ]


def join(campaign, username):
    user = make_user(username)
    Participation.objects.create(campaign=campaign, user=user)
    return user


def put(user, task, value="in_progress", note=""):
    return client_for(user).put(
        f"{TASKS}{task.pk}/progress/", {"status": value, "note": note}, format="json"
    )


@pytest.fixture
def world(db, settings):
    settings.PUBLIC_CAMPAIGNS_ENABLED = True
    owner = make_user("task-owner")
    maintainer = make_user("task-maint")
    project = new_project(owner, "task-app", "public", [maintainer])
    campaign = make_campaign(project, status.PUBLISHED, "public", slug="beta", method="structured")
    install, start = add_tasks(campaign, "Install the app", "Start the app")
    return {
        "owner": owner,
        "maintainer": maintainer,
        "project": project,
        "campaign": campaign,
        "install": install,
        "start": start,
        "tester": join(campaign, "task-tester"),
        "other": join(campaign, "task-other"),
        "stranger": make_user("task-stranger"),
    }


# --- Reading ------------------------------------------------------------------------------


def test_everyone_who_sees_the_campaign_reads_the_tasks(world):
    for user in (None, world["stranger"], world["tester"], world["owner"]):
        body = client_for(user).get(TASKS).json()
        assert body["method"] == "structured"
        assert [t["title"] for t in body["tasks"]] == ["Install the app", "Start the app"]
    assert client_for(world["tester"]).get(TASKS).json()["can_report"] is True
    assert client_for(world["stranger"]).get(TASKS).json()["can_report"] is False
    assert client_for(world["owner"]).get(TASKS).json()["can_report"] is False


def test_participants_see_only_their_own_progress(world):
    assert put(world["other"], world["install"], "blocked", "Crashes on start").status_code == 200
    mine = client_for(world["tester"]).get(TASKS).json()["tasks"][0]
    assert mine["my_status"] == "not_started"
    assert mine["my_note"] == ""
    theirs = client_for(world["other"]).get(TASKS).json()["tasks"][0]
    assert theirs["my_status"] == "blocked"
    assert theirs["my_note"] == "Crashes on start"
    for user in (None, world["stranger"], world["owner"]):
        assert "Crashes on start" not in client_for(user).get(TASKS).content.decode()


def test_private_and_draft_campaigns_are_404_for_strangers(world):
    private = make_campaign(world["project"], status.PUBLISHED, "private", slug="secret")
    add_tasks(private, "Hidden task")
    draft = make_campaign(world["project"], status.DRAFT, "public", slug="draft")
    for slug in ("secret", "draft"):
        url = f"/api/v1/projects/task-app/campaigns/{slug}/tasks/"
        assert client_for(world["stranger"]).get(url).status_code == 404
        assert client_for().get(url).status_code == 404
        assert client_for(world["owner"]).get(url).status_code == 200
    assert draft.method == "free"


# --- Changing tasks (team only) ---------------------------------------------------------------


@pytest.mark.parametrize("who", ["owner", "maintainer"])
def test_the_team_adds_changes_and_moves_tasks(world, who):
    team = client_for(world[who])
    response = team.post(
        TASKS,
        {
            "title": "  Export data ",
            "instructions": "Use **File > Export**.",
            "expected_result": "",
        },
        format="json",
    )
    assert response.status_code == 201, response.content
    created = response.json()
    assert created["title"] == "Export data"
    assert (
        team.patch(f"{TASKS}{created['id']}/", {"title": "Export a file"}, format="json").json()[
            "title"
        ]
        == "Export a file"
    )
    assert (
        team.post(f"{TASKS}{created['id']}/move/", {"direction": "up"}, format="json").status_code
        == 204
    )
    titles = [t["title"] for t in team.get(TASKS).json()["tasks"]]
    assert titles == ["Install the app", "Export a file", "Start the app"]
    assert (
        team.post(
            f"{TASKS}{created['id']}/move/", {"direction": "sideways"}, format="json"
        ).status_code
        == 400
    )


def test_only_the_team_changes_tasks(world):
    task = world["install"]
    for user in (world["tester"], world["stranger"]):
        client = client_for(user)
        assert client.post(TASKS, {"title": "Mine"}, format="json").status_code == 403
        assert client.patch(f"{TASKS}{task.pk}/", {"title": "x"}, format="json").status_code == 403
        assert client.delete(f"{TASKS}{task.pk}/").status_code == 403
        assert (
            client.post(f"{TASKS}{task.pk}/move/", {"direction": "up"}, format="json").status_code
            == 403
        )
    assert client_for().post(TASKS, {"title": "Anon"}, format="json").status_code in {401, 403}
    assert TestTask.objects.filter(campaign=world["campaign"]).count() == 2
    assert TestTask.objects.get(pk=task.pk).title == "Install the app"


def test_task_validation_and_limit(world):
    team = client_for(world["owner"])
    assert team.post(TASKS, {"title": "   "}, format="json").json() == {"title": ["blank"]}
    assert "title" in team.post(TASKS, {"title": "x" * 121}, format="json").json()
    add_tasks(world["campaign"], *[f"Task {n}" for n in range(TestTask.MAX_PER_CAMPAIGN - 2)])
    assert team.post(TASKS, {"title": "One too many"}, format="json").json() == {
        "code": "too_many_tasks"
    }


def test_removing_a_task_with_progress_hides_it(world):
    team = client_for(world["owner"])
    assert put(world["tester"], world["install"], "completed").status_code == 200
    assert team.delete(f"{TASKS}{world['install'].pk}/").json() == {"hidden": True}
    world["install"].refresh_from_db()
    assert world["install"].hidden_at is not None
    assert TaskProgress.objects.filter(task=world["install"]).exists()
    assert [t["title"] for t in team.get(TASKS).json()["tasks"]] == ["Start the app"]
    assert put(world["tester"], world["install"]).status_code == 404  # hidden: gone for testers
    # The last visible task of a published campaign cannot be removed.
    assert team.delete(f"{TASKS}{world['start'].pk}/").json() == {"code": "last_task"}


def test_removing_a_task_without_progress_deletes_it(world):
    team = client_for(world["owner"])
    assert team.delete(f"{TASKS}{world['start'].pk}/").json() == {"hidden": False}
    assert not TestTask.objects.filter(pk=world["start"].pk).exists()


def test_free_campaigns_have_no_tasks(world):
    free = make_campaign(world["project"], status.DRAFT, "public", slug="free")
    url = "/api/v1/projects/task-app/campaigns/free/tasks/"
    assert client_for(world["owner"]).post(url, {"title": "x"}, format="json").json() == {
        "code": "free_method_has_no_tasks"
    }
    assert free.tasks.count() == 0


def test_closed_and_blocked_campaigns_are_read_only(world):
    campaign = world["campaign"]
    campaign.state = Campaign.State.COMPLETED
    campaign.save()
    assert client_for(world["owner"]).post(TASKS, {"title": "Late"}, format="json").json() == {
        "code": "campaign_closed"
    }
    assert put(world["tester"], world["install"]).json() == {"code": "campaign_closed"}
    assert client_for(world["tester"]).get(TASKS).json()["can_report"] is False
    campaign.state = Campaign.State.PUBLISHED
    campaign.blocked_at = campaign.updated_at
    campaign.save()
    assert client_for(world["owner"]).post(TASKS, {"title": "Blocked"}, format="json").json() == {
        "code": "blocked"
    }
    assert put(world["tester"], world["install"]).status_code == 404  # blocked: gone for testers


# --- Method rules ---------------------------------------------------------------------------


def test_structured_and_combined_need_a_task_to_publish(world):
    api = "/api/v1/projects/task-app/campaigns/"
    owner = client_for(world["owner"])
    for method in ("structured", "combined"):
        draft = make_campaign(world["project"], status.DRAFT, "private", slug=method, method=method)
        assert owner.post(f"{api}{method}/publish/").json() == {"code": "tasks_required"}
        add_tasks(draft, "Try it")
        assert owner.post(f"{api}{method}/publish/").status_code == 200
    make_campaign(world["project"], status.DRAFT, "private", slug="free-one")
    assert owner.post(f"{api}free-one/publish/").status_code == 200


def test_method_rules_when_editing(world):
    api = "/api/v1/projects/task-app/campaigns/"
    owner = client_for(world["owner"])
    draft = make_campaign(
        world["project"], status.DRAFT, "private", slug="combo", method="combined"
    )
    add_tasks(draft, "Try it")
    assert owner.patch(f"{api}combo/", {"method": "free"}, format="json").json() == {
        "code": "tasks_exist"
    }
    assert owner.patch(f"{api}combo/", {"method": "structured"}, format="json").status_code == 200
    assert owner.patch(BASE, {"method": "combined"}, format="json").json() == {
        "code": "locked_after_publish"
    }
    assert owner.patch(f"{api}combo/", {"method": "nonsense"}, format="json").json() == {
        "method": ["invalid_choice"]
    }


# --- Progress -------------------------------------------------------------------------------


def test_participants_report_their_status_with_an_optional_note(world):
    response = put(
        world["tester"], world["install"], "blocked", "  The installer needs admin rights. "
    )
    assert response.status_code == 200, response.content
    assert response.json()["my_status"] == "blocked"
    assert response.json()["my_note"] == "The installer needs admin rights."
    assert put(world["tester"], world["install"], "completed").json()["my_note"] == ""
    assert TaskProgress.objects.filter(participation__user=world["tester"]).count() == 1
    assert put(world["tester"], world["install"], "done").json() == {"status": ["invalid_choice"]}
    assert "note" in put(world["tester"], world["install"], "blocked", "x" * 1001).json()


def test_only_active_participants_report(world):
    assert put(world["stranger"], world["install"]).json() == {"code": "not_participant"}
    assert put(world["owner"], world["install"]).json() == {"code": "not_participant"}
    assert client_for().put(
        f"{TASKS}{world['install'].pk}/progress/", {"status": "completed"}, format="json"
    ).status_code in {401, 403}
    assert not TaskProgress.objects.exists()


def test_progress_stays_after_leaving_and_continues_on_return(world):
    tester = world["tester"]
    put(tester, world["install"], "completed", "Worked fine")
    participation = Participation.objects.get(user=tester)
    participation.status = Participation.Status.LEFT
    participation.save()
    assert put(tester, world["install"], "blocked").json() == {"code": "not_participant"}
    assert client_for(tester).get(TASKS).json()["tasks"][0]["my_status"] == "completed"
    assert client_for(tester).post(f"{BASE}join/").status_code == 200
    assert client_for(tester).get(TASKS).json()["tasks"][0]["my_note"] == "Worked fine"


def test_progress_is_rate_limited(world, monkeypatch):
    from rest_framework.throttling import ScopedRateThrottle

    assert ScopedRateThrottle.THROTTLE_RATES["task_progress"] == "300/hour"
    # DRF reads the rates once at import; lower this scope for the test only.
    monkeypatch.setitem(ScopedRateThrottle.THROTTLE_RATES, "task_progress", "3/hour")
    cache.clear()
    codes = [put(world["tester"], world["install"]).status_code for _ in range(4)]
    assert codes == [200, 200, 200, 429]


# --- The team's overview ----------------------------------------------------------------------


def test_the_team_sees_everyones_progress(world):
    put(world["tester"], world["install"], "completed", "Fine")
    put(world["other"], world["install"], "blocked", "Crash")
    put(world["other"], world["start"], "in_progress")
    gone = Participation.objects.get(user=world["other"])
    gone.status = Participation.Status.REMOVED
    gone.save()
    join(world["campaign"], "task-silent-leaver").participations.update(status="left")
    body = client_for(world["maintainer"]).get(f"{BASE}progress/").json()
    install = body["tasks"][0]
    assert install["title"] == "Install the app"
    # Totals count everyone listed, including removed people (marked below).
    assert (install["completed"], install["blocked"], install["in_progress"]) == (1, 1, 0)
    people = {p["username"]: p for p in body["participants"]}
    assert set(people) == {"task-tester", "task-other"}  # left without progress: not listed
    assert people["task-other"]["participation"] == "removed"
    assert people["task-tester"]["progress"][str(world["install"].pk)]["note"] == "Fine"


def test_hidden_tasks_with_progress_stay_in_the_overview(world):
    put(world["tester"], world["install"], "completed")
    client_for(world["owner"]).delete(f"{TASKS}{world['install'].pk}/")
    tasks = client_for(world["owner"]).get(f"{BASE}progress/").json()["tasks"]
    assert [(t["title"], t["hidden"]) for t in tasks] == [
        ("Install the app", True),
        ("Start the app", False),
    ]


def test_the_overview_is_404_for_everyone_else(world):
    put(world["tester"], world["install"], "completed", "Secret note")
    for user in (None, world["tester"], world["stranger"], moderator("task-mod")):
        response = client_for(user).get(f"{BASE}progress/")
        assert response.status_code == 404
        assert "Secret note" not in response.content.decode()


# --- Moderation and personal data -------------------------------------------------------------


def test_moderators_see_the_tasks_in_the_review(world, settings):
    from allauth.mfa.models import Authenticator

    owner = world["owner"]
    Authenticator.objects.create(user=owner, type=Authenticator.Type.TOTP, data={"secret": "x"})
    draft = make_campaign(world["project"], status.DRAFT, "public", slug="rev", method="combined")
    TestTask.objects.create(campaign=draft, title="Open the hidden menu", instructions="Click it")
    response = client_for(owner).post("/api/v1/projects/task-app/campaigns/rev/publish/")
    assert response.json()["state"] == "in_review"
    reviews = client_for(moderator("task-rev")).get("/api/v1/moderation/reviews/").json()
    entry = next(c for c in reviews["campaigns"] if c["campaign"] == "rev")
    assert entry["method"] == "combined"
    assert entry["tasks"] == [
        {"title": "Open the hidden menu", "instructions": "Click it", "expected_result": ""}
    ]


def test_own_progress_is_in_the_export_and_goes_with_the_account(world):
    put(world["tester"], world["install"], "blocked", "My note")
    put(world["other"], world["install"], "completed", "Their note")
    exported = export_data(world["tester"])["campaign_task_progress"]
    assert exported == [
        {
            "campaign": "Campaign",
            "task": "Install the app",
            "status": "blocked",
            "note": "My note",
            "updated_at": exported[0]["updated_at"],
        }
    ]
    world["tester"].delete()
    assert list(TaskProgress.objects.values_list("note", flat=True)) == ["Their note"]


def test_the_account_page_lists_own_progress_in_short(world):
    put(world["tester"], world["install"], "completed")
    put(world["other"], world["start"], "blocked")
    mine = client_for(world["tester"]).get("/api/v1/me/participations/").json()
    assert [(p["tasks_total"], p["tasks_completed"], p["tasks_blocked"]) for p in mine] == [
        (2, 1, 0)
    ]
    theirs = client_for(world["other"]).get("/api/v1/me/participations/").json()
    assert [(p["tasks_completed"], p["tasks_blocked"]) for p in theirs] == [(0, 1)]
