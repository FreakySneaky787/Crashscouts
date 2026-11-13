"""Test tasks and progress (WP 4.1, ADR 0023).

Owner's decisions (2026-11-13): the testing method is a fixed choice (free: no tasks; structured
and combined: at least one task before publishing). Tasks stay editable after publishing; a task
with reported progress is hidden instead of deleted. Participants report one of four statuses per
task with an optional short note, seen only by the team and themselves. Progress belongs to the
participation: it stays when someone leaves or is removed and continues when they come back.
"""

from django.db import transaction
from django.utils import timezone

from .models import Campaign, Participation, TaskProgress, TestTask
from .services import CampaignError, ensure_unblocked

CLOSED = (Campaign.State.COMPLETED, Campaign.State.CANCELLED)


def visible_tasks(campaign: Campaign):
    return TestTask.objects.filter(campaign=campaign, hidden_at__isnull=True)


def _ensure_tasks_editable(campaign: Campaign) -> None:
    ensure_unblocked(campaign)
    if campaign.state in CLOSED:
        raise CampaignError("campaign_closed")
    if campaign.method == Campaign.Method.FREE:
        raise CampaignError("free_method_has_no_tasks")


def _locked(campaign: Campaign) -> Campaign:
    return Campaign.objects.select_for_update().select_related("project").get(pk=campaign.pk)


@transaction.atomic
def add_task(campaign: Campaign, **fields) -> TestTask:
    campaign = _locked(campaign)
    _ensure_tasks_editable(campaign)
    tasks = visible_tasks(campaign)
    if tasks.count() >= TestTask.MAX_PER_CAMPAIGN:
        raise CampaignError("too_many_tasks")
    last = TestTask.objects.filter(campaign=campaign).order_by("-position").first()
    position = last.position + 1 if last is not None else 0
    return TestTask.objects.create(campaign=campaign, position=position, **fields)


@transaction.atomic
def change_task(task: TestTask, **fields) -> TestTask:
    _ensure_tasks_editable(_locked(task.campaign))
    for key, value in fields.items():
        setattr(task, key, value)
    task.save()
    return task


@transaction.atomic
def move_task(task: TestTask, direction: str) -> None:
    """Swaps the task with its visible neighbour above ("up") or below ("down")."""
    campaign = _locked(task.campaign)
    _ensure_tasks_editable(campaign)
    tasks = list(visible_tasks(campaign))
    index = next(i for i, t in enumerate(tasks) if t.pk == task.pk)
    other = index - 1 if direction == "up" else index + 1
    if not 0 <= other < len(tasks):
        return
    tasks[index], tasks[other] = tasks[other], tasks[index]
    for position, item in enumerate(tasks):
        if item.position != position:
            item.position = position
            item.save(update_fields=["position", "updated_at"])


@transaction.atomic
def remove_task(task: TestTask) -> bool:
    """Deletes the task, or hides it when someone already reported progress. Returns whether it
    was hidden. Once a campaign is no longer a draft, its last visible task cannot be removed:
    structured and combined campaigns always keep at least one task."""
    campaign = _locked(task.campaign)
    _ensure_tasks_editable(campaign)
    if campaign.state != Campaign.State.DRAFT and visible_tasks(campaign).count() <= 1:
        raise CampaignError("last_task")
    if TaskProgress.objects.filter(task=task).exists():
        task.hidden_at = timezone.now()
        task.save(update_fields=["hidden_at", "updated_at"])
        return True
    task.delete()
    return False


def ensure_tasks_for_method(campaign: Campaign) -> None:
    """Before publishing or submitting: structured and combined campaigns need a task."""
    if campaign.method != Campaign.Method.FREE and not visible_tasks(campaign).exists():
        raise CampaignError("tasks_required")


def ensure_method_change_allowed(campaign: Campaign, method: str) -> None:
    if method == Campaign.Method.FREE and visible_tasks(campaign).exists():
        raise CampaignError("tasks_exist")


@transaction.atomic
def report_progress(task: TestTask, user, *, status: str, note: str) -> TaskProgress:
    """Sets the user's own status of a task. Only active participants of a published campaign,
    and only for visible tasks; a closed or blocked campaign is read-only."""
    campaign = _locked(task.campaign)
    ensure_unblocked(campaign)
    if campaign.state != Campaign.State.PUBLISHED:
        raise CampaignError("campaign_closed")
    task = TestTask.objects.select_for_update().get(pk=task.pk)
    if task.hidden_at is not None:
        raise CampaignError("task_hidden")
    participation = Participation.objects.filter(
        campaign=campaign, user=user, status=Participation.Status.ACTIVE
    ).first()
    if participation is None:
        raise CampaignError("not_participant")
    progress, _ = TaskProgress.objects.update_or_create(
        participation=participation, task=task, defaults={"status": status, "note": note}
    )
    return progress


def own_progress(campaign: Campaign, user) -> dict[str, TaskProgress]:
    """The user's own progress in a campaign (any participation status), keyed by task id."""
    if not getattr(user, "is_authenticated", False):
        return {}
    rows = TaskProgress.objects.filter(participation__campaign=campaign, participation__user=user)
    return {str(row.task_id): row for row in rows}
