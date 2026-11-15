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

from apps.accounts.roles import is_admin, is_moderator
from apps.campaigns.models import Campaign, CampaignLink
from apps.projects.policies import can_edit

from . import access, suspensions
from .actions import (
    TARGET_MODELS,
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
    taken_by,
    warn,
)
from .models import OPEN_STATES, AccountSuspension, Block, ModerationNote, ModeratorAccess, Report
from .reviews import (
    approve_campaign,
    approve_link,
    pending_campaigns,
    pending_links,
    reject_campaign,
    reject_link,
)

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
    if project is None:  # a person (WP 7.1)
        return {
            "project": None,
            "project_name": None,
            "title": f"@{target.username}",
            "username": target.username,
            "blocked": False,
        }
    data = {"project": project.slug, "project_name": project.name}
    if target_type == "project":
        data["title"] = project.name
    elif target_type == "campaign":
        data.update(title=target.title, campaign=target.slug)
    elif target_type == "feedback":
        data.update(title=target.title, campaign=target.campaign.slug, feedback=str(target.pk))
    else:
        data.update(
            title=target.label,
            campaign=target.campaign.slug,
            url=target.url,
            suspended=target.suspended_at is not None,
        )
    data["blocked"] = target.blocked_at is not None
    return data


# What each kind of target needs for its summary, loaded together with it (WP 8.6: one query
# per kind instead of several per case; 300 open cases took 606 queries before).
CASE_RELATIONS: dict[str, tuple[str, ...]] = {
    "project": (),
    "campaign": ("project",),
    "link": ("campaign__project",),
    "feedback": ("campaign__project",),
    "user": (),
}


def _takers(field: str) -> dict:
    """The moderator who took each case: the newest open report with one, as ``taken_by``."""
    takers = {}
    reports = (
        Report.objects.filter(target_type=field, status__in=OPEN_STATES, taken_by__isnull=False)
        .order_by("-created_at")
        .values_list(field, "taken_by__username")
    )
    for target_id, username in reports:
        takers.setdefault(target_id, username)
    return takers


class CasesView(ModeratorView):
    """Targets with open or in-review reports; malware and suspended links first, then oldest."""

    @extend_schema(
        operation_id="moderation_cases_list",
        responses=inline_serializer("ModerationCases", {"x": serializers.CharField()}),
    )
    def get(self, request: Request) -> Response:
        rows = []
        for field in ("project", "campaign", "link", "feedback", "user"):
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
            grouped = list(grouped)
            queryset = TARGET_MODELS[field].objects.all()
            if CASE_RELATIONS[field]:
                queryset = queryset.select_related(*CASE_RELATIONS[field])
            targets = queryset.in_bulk([entry[field] for entry in grouped])
            takers = _takers(field)
            for entry in grouped:
                target = targets.get(entry[field])
                if target is None:
                    continue
                rows.append(
                    {
                        "target_type": field,
                        "target_id": str(target.pk),
                        "reports": entry["count"],
                        "malware": entry["malware"] > 0,
                        "oldest": entry["oldest"].isoformat(),
                        "taken_by": takers.get(target.pk),
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
        extra = {}
        if project is None:  # a person: notes and suspensions, no content blocks
            notes = ModerationNote.objects.filter(user=target)
            blocks = Block.objects.none()
            found = AccountSuspension.objects.filter(user=target).select_related(
                "user", "created_by", "lifted_by", "appeal_decided_by"
            )
            in_force = suspensions.active_suspension(target)
            extra = {
                "suspensions": [suspensions.describe(s) for s in found],
                "active_suspension": str(in_force.pk) if in_force else None,
                "can_suspend": not target.platform_role and target.pk != request.user.pk,
            }
        else:
            notes = ModerationNote.objects.filter(project=project)
            blocks = Block.objects.filter(
                Q(project=project)
                | Q(campaign__project=project)
                | Q(link__campaign__project=project)
                | Q(feedback__campaign__project=project)
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
                "notes": [{"text": n.text, "created_at": n.created_at.isoformat()} for n in notes],
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
                # WP 7.3: who took the case, and this moderator's access to the content.
                "taken_by": getattr(taken_by(target), "username", None),
                "access": _own_access(target, request.user),
                **extra,
            }
        )


class ActionSerializer(serializers.Serializer):
    category = serializers.ChoiceField(choices=Report.Reason.choices, required=False)
    message = serializers.CharField(
        max_length=Block.MESSAGE_MAX_LENGTH, required=False, allow_blank=True
    )
    # Suspensions (WP 7.2): the end, or null for a permanent suspension.
    ends_at = serializers.DateTimeField(required=False, allow_null=True)
    # Purpose-bound access (WP 7.3): why the moderator needs to see the content.
    reason = serializers.CharField(
        max_length=ModeratorAccess.REASON_MAX_LENGTH, required=False, allow_blank=True
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
            elif action == "access":
                access.grant(target, request.user, data.get("reason", ""))
            elif action == "suspend" and target_type == "user":
                if "ends_at" not in data:
                    raise ModerationError("end_required")  # a date, or null for permanently
                suspensions.suspend(
                    target,
                    request.user,
                    data.get("category", ""),
                    data.get("message", ""),
                    data["ends_at"],
                )
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


class ReviewsView(ModeratorView):
    """Public campaigns waiting for review, and waiting links of published campaigns."""

    @extend_schema(
        operation_id="moderation_reviews_list",
        responses=inline_serializer("Reviews", {"x": serializers.CharField()}),
    )
    def get(self, request: Request) -> Response:
        def link_data(link):
            return {
                "id": str(link.pk),
                "label": link.label,
                "url": link.url,
                "sha256": link.sha256,
                "review_status": link.review_status,
            }

        return Response(
            {
                "campaigns": [
                    {
                        "id": str(c.pk),
                        "title": c.title,
                        "summary": c.summary,
                        "description": c.description,
                        "project": c.project.slug,
                        "project_name": c.project.name,
                        "campaign": c.slug,
                        "method": c.method,
                        "links": [link_data(link) for link in c.links.all()],
                        # Tasks are text that testers follow; moderators see them in the review
                        # so nothing can hide there (ADR 0023).
                        "tasks": [
                            {
                                "title": t.title,
                                "instructions": t.instructions,
                                "expected_result": t.expected_result,
                            }
                            for t in c.tasks.filter(hidden_at__isnull=True)
                        ],
                    }
                    for c in pending_campaigns()
                ],
                "links": [
                    {
                        **link_data(link),
                        "campaign_title": link.campaign.title,
                        "project": link.campaign.project.slug,
                        "project_name": link.campaign.project.name,
                        "campaign": link.campaign.slug,
                    }
                    for link in pending_links()
                ],
            }
        )


class ReviewDecisionView(ModeratorView):
    @extend_schema(
        operation_id="moderation_review_decide",
        request=ActionSerializer,
        responses={204: None, 400: CODE},
    )
    def post(self, request: Request, kind: str, target_id, decision: str) -> Response:
        model = {"campaign": Campaign, "link": CampaignLink}.get(kind)
        target = model.objects.filter(pk=target_id).first() if model else None
        if target is None or decision not in {"approve", "reject"}:
            raise Http404
        message = str(request.data.get("message", ""))
        try:
            if kind == "campaign":
                if decision == "approve":
                    approve_campaign(target, request.user)
                else:
                    reject_campaign(target, request.user, message)
            elif decision == "approve":
                approve_link(target, request.user)
            else:
                reject_link(target, request.user, message)
        except ModerationError as exc:
            return _error(exc)
        return Response(status=status.HTTP_204_NO_CONTENT)


# --- Account suspensions (WP 7.2, ADR 0027) ---------------------------------------------------


def _suspension_or_404(suspension_id) -> AccountSuspension:
    found = AccountSuspension.objects.filter(pk=suspension_id).select_related("user").first()
    if found is None:
        raise Http404
    return found


def _with_people(queryset):
    return queryset.select_related("user", "created_by", "lifted_by", "appeal_decided_by")


class SuspensionLiftView(ModeratorView):
    """Any moderator lifts a suspension (also early)."""

    @extend_schema(
        operation_id="moderation_suspension_lift", request=None, responses={204: None, 400: CODE}
    )
    def post(self, request: Request, suspension_id) -> Response:
        try:
            suspensions.lift(_suspension_or_404(suspension_id), request.user)
        except ModerationError as exc:
            return _error(exc)
        return Response(status=status.HTTP_204_NO_CONTENT)


class SuspensionAppealDecisionView(ModeratorView):
    """Any moderator decides an appeal, also the one who suspended (owner's decision)."""

    @extend_schema(
        operation_id="moderation_suspension_appeal_decide",
        request=None,
        responses={204: None, 400: CODE},
    )
    def post(self, request: Request, suspension_id, decision: str) -> Response:
        if decision not in {"uphold", "lift"}:
            raise Http404
        found = _suspension_or_404(suspension_id)
        try:
            suspensions.decide_appeal(
                found, request.user, "upheld" if decision == "uphold" else "lifted"
            )
        except ModerationError as exc:
            return _error(exc)
        return Response(status=status.HTTP_204_NO_CONTENT)


class SuspensionAppealsView(ModeratorView):
    """Open appeals against suspensions, oldest first."""

    @extend_schema(
        operation_id="moderation_suspension_appeals_list",
        responses=inline_serializer("SuspensionAppeals", {"x": serializers.CharField()}),
    )
    def get(self, request: Request) -> Response:
        found = _with_people(
            AccountSuspension.objects.filter(
                appealed_at__isnull=False, appeal_decision="", lifted_at__isnull=True
            ).order_by("appealed_at")
        )
        return Response([suspensions.describe(s) for s in found])


class SuspensionsView(ModeratorView):
    """Every suspension with who suspended, lifted and decided; admins only (owner's decision:
    no four-eyes principle, so admins keep an overview)."""

    @extend_schema(
        operation_id="moderation_suspensions_list",
        responses=inline_serializer("Suspensions", {"x": serializers.CharField()}),
    )
    def get(self, request: Request) -> Response:
        if not is_admin(request.user):
            raise Http404
        found = _with_people(AccountSuspension.objects.all())[:500]
        return Response([suspensions.describe(s) for s in found])


# --- Purpose-bound access (WP 7.3, ADR 0028) ----------------------------------------------------


def _own_access(target, moderator) -> dict | None:
    found = access.current_access(target, moderator)
    return access.describe(found) if found else None


class AccessView(ModeratorView):
    """The read-only content behind the moderator's own access while it is valid; 404 otherwise
    (also for other moderators). Every view is audited."""

    @extend_schema(
        operation_id="moderation_access_view",
        responses=inline_serializer("ModeratorAccessContent", {"x": serializers.CharField()}),
    )
    def get(self, request: Request, access_id) -> Response:
        found = access.view(access_id, request.user)
        if found is None:
            raise Http404
        response = Response(found)
        response["Cache-Control"] = "private, no-store"
        return response


class AccessesView(ModeratorView):
    """Every access with moderator, reason and number of views; admins only."""

    @extend_schema(
        operation_id="moderation_accesses_list",
        responses=inline_serializer("ModeratorAccesses", {"x": serializers.CharField()}),
    )
    def get(self, request: Request) -> Response:
        if not is_admin(request.user):
            raise Http404
        found = ModeratorAccess.objects.select_related("moderator")[:500]
        return Response([access.describe(a) for a in found])


# --- Statistics (WP 7.4, ADR 0029) ---------------------------------------------------------------


class StatisticsView(ModeratorView):
    """Sums per month for the last 12 months; admins only."""

    @extend_schema(
        operation_id="moderation_statistics",
        responses=inline_serializer("ModerationStatistics", {"x": serializers.CharField()}),
    )
    def get(self, request: Request) -> Response:
        if not is_admin(request.user):
            raise Http404
        from .statistics import statistics

        response = Response(statistics())
        response["Cache-Control"] = "private, no-store"
        return response
