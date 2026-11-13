"""Moderation API (WP 3B.3). Moderators only; a plain 404 for everyone else. Teams appeal
blocks of their own content."""

from django.db.models import Count, Min, Q
from django.http import Http404
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.roles import is_moderator
from apps.projects.policies import can_edit

from .actions import (
    ModerationError,
    active_block,
    appeal,
    block,
    decide_appeal,
    dismiss,
    get_target,
    lift,
    lift_suspension,
    owning_project,
    take_case,
    warn,
)
from .models import OPEN_STATES, Block, ModerationNote, Report

CODE = inline_serializer("ModerationError", {"code": serializers.CharField()})


class ModeratorView(APIView):
    permission_classes = (IsAuthenticated,)

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if not is_moderator(request.user):
            raise Http404


def _error(exc: ModerationError) -> Response:
    return Response({"code": exc.code}, status=status.HTTP_400_BAD_REQUEST)


def _target_or_404(target_type: str, target_id):
    target = get_target(target_type, target_id)
    if target is None:
        raise Http404
    return target


def _summary(target_type: str, target) -> dict:
    project = owning_project(target)
    data = {"project": project.slug, "project_name": project.name}
    if target_type == "project":
        data["title"] = project.name
    elif target_type == "campaign":
        data.update(title=target.title, campaign=target.slug)
    else:
        data.update(
            title=target.label,
            campaign=target.campaign.slug,
            url=target.url,
            suspended=target.suspended_at is not None,
        )
    data["blocked"] = target.blocked_at is not None
    return data


class CasesView(ModeratorView):
    """Targets with open or in-review reports; malware and suspended links first, then oldest."""

    @extend_schema(
        operation_id="moderation_cases_list",
        responses=inline_serializer("ModerationCases", {"x": serializers.CharField()}),
    )
    def get(self, request: Request) -> Response:
        rows = []
        for field in ("project", "campaign", "link"):
            grouped = (
                Report.objects.filter(
                    target_type=field, status__in=OPEN_STATES, **{f"{field}__isnull": False}
                )
                .values(field)
                .annotate(
                    count=Count("id"),
                    malware=Count("id", filter=Q(reason=Report.Reason.MALWARE)),
                    oldest=Min("created_at"),
                )
            )
            for entry in grouped:
                target = get_target(field, entry[field])
                if target is None:
                    continue
                rows.append(
                    {
                        "target_type": field,
                        "target_id": str(target.pk),
                        "reports": entry["count"],
                        "malware": entry["malware"] > 0,
                        "oldest": entry["oldest"].isoformat(),
                        **_summary(field, target),
                    }
                )
        rows.sort(key=lambda r: (not r["malware"], not r.get("suspended", False), r["oldest"]))
        return Response(rows)


class CaseView(ModeratorView):
    @extend_schema(responses=inline_serializer("ModerationCase", {"x": serializers.CharField()}))
    def get(self, request: Request, target_type: str, target_id) -> Response:
        target = _target_or_404(target_type, target_id)
        project = owning_project(target)
        reports = Report.objects.filter(
            target_type=target_type, **{target_type: target}
        ).select_related("reporter")
        blocks = Block.objects.filter(
            Q(project=project) | Q(campaign__project=project) | Q(link__campaign__project=project)
        )
        current = active_block(target)
        return Response(
            {
                "target_type": target_type,
                "target_id": str(target.pk),
                **_summary(target_type, target),
                "reports": [
                    {
                        "reason": r.reason,
                        "text": r.text,
                        "status": r.status,
                        "reporter": r.reporter.username if r.reporter else None,
                        "created_at": r.created_at.isoformat(),
                    }
                    for r in reports
                ],
                "notes": [
                    {"text": n.text, "created_at": n.created_at.isoformat()}
                    for n in ModerationNote.objects.filter(project=project)
                ],
                "blocks": [
                    {
                        "id": str(b.pk),
                        "target_type": b.target_type,
                        "category": b.category,
                        "message": b.message,
                        "created_at": b.created_at.isoformat(),
                        "lifted_at": b.lifted_at.isoformat() if b.lifted_at else None,
                    }
                    for b in blocks
                ],
                "active_block": str(current.pk) if current else None,
            }
        )


class ActionSerializer(serializers.Serializer):
    category = serializers.ChoiceField(choices=Report.Reason.choices, required=False)
    message = serializers.CharField(
        max_length=Block.MESSAGE_MAX_LENGTH, required=False, allow_blank=True
    )


class CaseActionView(ModeratorView):
    @extend_schema(
        operation_id="moderation_case_action",
        request=ActionSerializer,
        responses={204: None, 400: CODE},
    )
    def post(self, request: Request, target_type: str, target_id, action: str) -> Response:
        target = _target_or_404(target_type, target_id)
        serializer = ActionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"code": "invalid"}, status=status.HTTP_400_BAD_REQUEST)
        data = serializer.validated_data
        try:
            if action == "take":
                take_case(target, request.user)
            elif action == "block":
                block(target, request.user, data.get("category", ""), data.get("message", ""))
            elif action == "warn":
                warn(target, request.user, data.get("message", ""))
            elif action == "dismiss":
                dismiss(target, request.user)
            elif action == "lift-suspension" and target_type == "link":
                lift_suspension(target, request.user)
            else:
                raise Http404
        except ModerationError as exc:
            return _error(exc)
        return Response(status=status.HTTP_204_NO_CONTENT)


class BlockLiftView(ModeratorView):
    @extend_schema(request=None, responses={204: None, 400: CODE})
    def post(self, request: Request, block_id) -> Response:
        found = Block.objects.filter(pk=block_id).first()
        if found is None:
            raise Http404
        try:
            lift(found, request.user)
        except ModerationError as exc:
            return _error(exc)
        return Response(status=status.HTTP_204_NO_CONTENT)


class AppealsView(ModeratorView):
    @extend_schema(responses=inline_serializer("Appeals", {"x": serializers.CharField()}))
    def get(self, request: Request) -> Response:
        appeals = Block.objects.filter(
            appealed_at__isnull=False, appeal_decision="", lifted_at__isnull=True
        ).order_by("appealed_at")
        return Response(
            [
                {
                    "block": str(b.pk),
                    "target_type": b.target_type,
                    "target_id": str(b.target.pk),
                    "title": _summary(b.target_type, b.target)["title"],
                    "project": owning_project(b.target).slug,
                    "category": b.category,
                    "message": b.message,
                    "appeal_text": b.appeal_text,
                    "appealed_at": b.appealed_at.isoformat(),
                }
                for b in appeals
            ]
        )


class AppealDecisionView(ModeratorView):
    @extend_schema(
        operation_id="moderation_appeal_decide", request=None, responses={204: None, 400: CODE}
    )
    def post(self, request: Request, block_id, decision: str) -> Response:
        found = Block.objects.filter(pk=block_id).first()
        if found is None or decision not in {"uphold", "lift"}:
            raise Http404
        try:
            decide_appeal(found, request.user, "upheld" if decision == "uphold" else "lifted")
        except ModerationError as exc:
            return _error(exc)
        return Response(status=status.HTTP_204_NO_CONTENT)


class AppealCreateView(APIView):
    """A member of the blocked content's team appeals, once. 404 for everyone else."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        request=inline_serializer("AppealCreate", {"text": serializers.CharField()}),
        responses={204: None, 400: CODE},
    )
    def post(self, request: Request, block_id) -> Response:
        found = Block.objects.filter(pk=block_id).first()
        if found is None or not can_edit(request.user, owning_project(found.target)):
            raise Http404
        text = str(request.data.get("text", ""))[: Block.MESSAGE_MAX_LENGTH + 1]
        if len(text) > Block.MESSAGE_MAX_LENGTH:
            return Response({"code": "too_long"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            appeal(found, request.user, text)
        except ModerationError as exc:
            return _error(exc)
        return Response(status=status.HTTP_204_NO_CONTENT)
