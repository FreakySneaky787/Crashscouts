"""Test tasks and progress API (WP 4.1, ADR 0023).

- Tasks: everyone who sees the campaign reads them; only the team changes them.
- Progress: participants set their own status; each viewer sees only their own. The team's
  overview of everyone's progress is a plain 404 for everyone else.
"""

from django.db.models import Count
from django.http import Http404
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.core.api import error_codes

from .models import Campaign, Participation, TaskProgress, TestTask
from .policies import can_edit, is_participant
from .question_views import _team_campaign
from .serializers import TaskProgressWriteSerializer, TestTaskSerializer
from .services import CampaignError
from .tasks import (
    add_task,
    change_task,
    move_task,
    own_progress,
    remove_task,
    report_progress,
    visible_tasks,
)
from .views import ErrorSerializer, _campaign, _error


class TaskReadSerializer(TestTaskSerializer):
    """Schema of a task as read, with the viewer's own progress."""

    my_status = serializers.ChoiceField(choices=TaskProgress.Status.choices, read_only=True)
    my_note = serializers.CharField(read_only=True)


def _task(campaign: Campaign, task_id, *, include_hidden: bool = False) -> TestTask:
    tasks = TestTask.objects.filter(campaign=campaign, pk=task_id)
    if not include_hidden:
        tasks = tasks.filter(hidden_at__isnull=True)
    task = tasks.first()
    if task is None:
        raise Http404
    return task


def _task_data(task: TestTask, mine: TaskProgress | None) -> dict:
    return {
        **TestTaskSerializer(task).data,
        "my_status": mine.status if mine else TaskProgress.Status.NOT_STARTED,
        "my_note": mine.note if mine else "",
    }


class TasksView(APIView):
    permission_classes = (AllowAny,)

    @extend_schema(
        responses=inline_serializer(
            "TestTasks",
            {
                "method": serializers.ChoiceField(choices=Campaign.Method.choices),
                "tasks": TaskReadSerializer(many=True),
                "can_report": serializers.BooleanField(),
            },
        )
    )
    def get(self, request: Request, slug: str, campaign_slug: str) -> Response:
        campaign = _campaign(request, slug, campaign_slug)
        mine = own_progress(campaign, request.user)
        can_report = campaign.state == Campaign.State.PUBLISHED and is_participant(
            request.user, campaign
        )
        return Response(
            {
                "method": campaign.method,
                "tasks": [_task_data(t, mine.get(str(t.pk))) for t in visible_tasks(campaign)],
                "can_report": can_report,
            }
        )

    @extend_schema(
        request=TestTaskSerializer, responses={201: TestTaskSerializer, 400: ErrorSerializer}
    )
    def post(self, request: Request, slug: str, campaign_slug: str) -> Response:
        campaign = _team_campaign(request, slug, campaign_slug)
        serializer = TestTaskSerializer(data=request.data)
        if not serializer.is_valid():
            return error_codes(serializer)
        try:
            task = add_task(campaign, **serializer.validated_data)
        except CampaignError as exc:
            return _error(exc)
        return Response(TestTaskSerializer(task).data, status=status.HTTP_201_CREATED)


class TaskView(APIView):
    permission_classes = (AllowAny,)

    @extend_schema(
        request=TestTaskSerializer, responses={200: TestTaskSerializer, 400: ErrorSerializer}
    )
    def patch(self, request: Request, slug: str, campaign_slug: str, task_id) -> Response:
        campaign = _team_campaign(request, slug, campaign_slug)
        task = _task(campaign, task_id)
        serializer = TestTaskSerializer(task, data=request.data, partial=True)
        if not serializer.is_valid():
            return error_codes(serializer)
        try:
            task = change_task(task, **serializer.validated_data)
        except CampaignError as exc:
            return _error(exc)
        return Response(TestTaskSerializer(task).data)

    @extend_schema(
        request=None,
        responses={
            200: inline_serializer("TestTaskRemoved", {"hidden": serializers.BooleanField()}),
            400: ErrorSerializer,
        },
    )
    def delete(self, request: Request, slug: str, campaign_slug: str, task_id) -> Response:
        campaign = _team_campaign(request, slug, campaign_slug)
        try:
            hidden = remove_task(_task(campaign, task_id))
        except CampaignError as exc:
            return _error(exc)
        return Response({"hidden": hidden})


class TaskMoveView(APIView):
    permission_classes = (AllowAny,)

    @extend_schema(
        request=inline_serializer(
            "TestTaskMove",
            {"direction": serializers.ChoiceField(choices=[("up", "Up"), ("down", "Down")])},
        ),
        responses={204: None, 400: ErrorSerializer},
    )
    def post(self, request: Request, slug: str, campaign_slug: str, task_id) -> Response:
        campaign = _team_campaign(request, slug, campaign_slug)
        task = _task(campaign, task_id)
        direction = request.data.get("direction")
        if direction not in ("up", "down"):
            return Response({"direction": ["invalid_choice"]}, status=400)
        try:
            move_task(task, direction)
        except CampaignError as exc:
            return _error(exc)
        return Response(status=status.HTTP_204_NO_CONTENT)


class TaskProgressView(APIView):
    """PUT: the signed-in participant's own status of one task."""

    permission_classes = (IsAuthenticated,)
    throttle_classes = (ScopedRateThrottle,)
    throttle_scope = "task_progress"

    @extend_schema(
        request=TaskProgressWriteSerializer,
        responses={200: TaskReadSerializer, 400: ErrorSerializer},
    )
    def put(self, request: Request, slug: str, campaign_slug: str, task_id) -> Response:
        campaign = _campaign(request, slug, campaign_slug)
        task = _task(campaign, task_id)
        serializer = TaskProgressWriteSerializer(data=request.data)
        if not serializer.is_valid():
            return error_codes(serializer)
        try:
            progress = report_progress(task, request.user, **serializer.validated_data)
        except CampaignError as exc:
            return _error(exc)
        return Response(_task_data(task, progress))


ProgressEntry = inline_serializer(
    "TaskProgressEntry",
    {
        "status": serializers.ChoiceField(choices=TaskProgress.Status.choices),
        "note": serializers.CharField(),
        "updated_at": serializers.DateTimeField(),
    },
)


class ProgressOverviewView(APIView):
    """GET: everyone's progress, for the team only (a plain 404 for everyone else). Includes
    people who left or were removed, and hidden tasks with reported progress, each marked."""

    permission_classes = (AllowAny,)

    @extend_schema(
        responses=inline_serializer(
            "TaskProgressOverview",
            {
                "tasks": inline_serializer(
                    "TaskProgressOverviewTask",
                    {
                        "id": serializers.UUIDField(),
                        "title": serializers.CharField(),
                        "hidden": serializers.BooleanField(),
                        "completed": serializers.IntegerField(),
                        "blocked": serializers.IntegerField(),
                        "in_progress": serializers.IntegerField(),
                        "feedback": serializers.IntegerField(),
                    },
                    many=True,
                ),
                "participants": inline_serializer(
                    "TaskProgressOverviewParticipant",
                    {
                        "username": serializers.CharField(),
                        "participation": serializers.ChoiceField(
                            choices=Participation.Status.choices
                        ),
                        "progress": serializers.DictField(child=ProgressEntry),
                    },
                    many=True,
                ),
            },
        )
    )
    def get(self, request: Request, slug: str, campaign_slug: str) -> Response:
        campaign = _campaign(request, slug, campaign_slug)
        if not can_edit(request.user, campaign):
            raise Http404
        rows = list(
            TaskProgress.objects.filter(participation__campaign=campaign).select_related(
                "participation"
            )
        )
        with_progress = {row.task_id for row in rows}
        tasks = [
            t
            for t in TestTask.objects.filter(campaign=campaign)
            if t.hidden_at is None or t.pk in with_progress
        ]
        participations = (
            # Accounts in their deletion grace period are invisible, as everywhere (WP 3A.6).
            Participation.objects.filter(
                campaign=campaign, user__deletion_scheduled_for__isnull=True
            )
            .select_related("user")
            .order_by("created_at")
        )
        listed = {p.pk for p in participations}
        by_participation: dict = {}
        for row in rows:
            if row.participation_id in listed:
                by_participation.setdefault(row.participation_id, {})[str(row.task_id)] = {
                    "status": row.status,
                    "note": row.note,
                    "updated_at": row.updated_at,
                }

        from apps.feedback.models import Feedback  # the feedback app builds on campaigns

        feedback_counts = dict(
            Feedback.objects.filter(campaign=campaign, task__isnull=False)
            .values_list("task")
            .annotate(n=Count("pk"))
            .values_list("task", "n")
        )

        def count(task_id, value) -> int:
            return sum(
                1
                for row in rows
                if row.participation_id in listed and row.task_id == task_id and row.status == value
            )

        return Response(
            {
                "tasks": [
                    {
                        "id": t.pk,
                        "title": t.title,
                        "hidden": t.hidden_at is not None,
                        "completed": count(t.pk, TaskProgress.Status.COMPLETED),
                        "blocked": count(t.pk, TaskProgress.Status.BLOCKED),
                        "in_progress": count(t.pk, TaskProgress.Status.IN_PROGRESS),
                        # How much feedback names this task (WP 5.4, ADR 0024).
                        "feedback": feedback_counts.get(t.pk, 0),
                    }
                    for t in tasks
                ],
                "participants": [
                    {
                        "username": p.user.username,
                        "participation": p.status,
                        "progress": by_participation.get(p.pk, {}),
                    }
                    for p in participations
                    # Former participants appear only when they reported something.
                    if p.status == Participation.Status.ACTIVE or p.pk in by_participation
                ],
            }
        )
