"""Feedback API (ADR 0024). Anything a person may not see is a plain 404."""

from django.http import Http404
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.campaigns.services import CampaignError
from apps.campaigns.views import ErrorSerializer, _campaign
from apps.core.api import error_codes
from apps.core.throttling import USER_AND_IP

from . import policies
from .models import Feedback
from .serializers import (
    FeedbackDetailSerializer,
    FeedbackSerializer,
    FeedbackWriteSerializer,
    MyFeedbackSerializer,
)
from .services import (
    change_feedback,
    change_status,
    create_feedback,
    publish_action,
    withdraw_feedback,
)

FORBIDDEN_CODES = {"not_allowed", "not_author"}


def _error(exc: CampaignError) -> Response:
    forbidden = exc.code in FORBIDDEN_CODES
    return Response(
        {"code": exc.code},
        status=status.HTTP_403_FORBIDDEN if forbidden else status.HTTP_400_BAD_REQUEST,
    )


def _related(queryset):
    return queryset.select_related(
        "campaign__project", "author", "platform", "task", "duplicate_of"
    )


def _feedback(request: Request, slug: str, campaign_slug: str, feedback_id) -> Feedback:
    feedback = (
        _related(Feedback.objects)
        .filter(
            pk=feedback_id,
            campaign__slug=campaign_slug.lower(),
            campaign__project__slug=slug.lower(),
        )
        .first()
    )
    if feedback is None or not policies.can_view(request.user, feedback):
        raise Http404
    return feedback


FILTERS = [
    OpenApiParameter("kind", str, enum=Feedback.Kind.values),
    OpenApiParameter("status", str, enum=Feedback.Status.values),
    OpenApiParameter("task", str),
]


class FeedbackListView(APIView):
    """GET: the campaign's feedback the viewer may see. POST: new feedback (participants)."""

    permission_classes = (AllowAny,)
    throttle_scope = "feedback_create"

    def get_throttles(self):
        return [cls() for cls in USER_AND_IP] if self.request.method == "POST" else []

    @extend_schema(parameters=FILTERS, responses=FeedbackSerializer(many=True))
    def get(self, request: Request, slug: str, campaign_slug: str) -> Response:
        campaign = _campaign(request, slug, campaign_slug)
        feedback = _related(policies.visible_feedback(request.user, campaign))
        kind = request.query_params.get("kind")
        if kind in Feedback.Kind.values:
            feedback = feedback.filter(kind=kind)
        state = request.query_params.get("status")
        if state in Feedback.Status.values:
            feedback = feedback.filter(status=state)
        task = request.query_params.get("task")
        if task:
            try:
                feedback = feedback.filter(task_id=serializers.UUIDField().to_internal_value(task))
            except serializers.ValidationError:
                feedback = feedback.none()
        context = {"request": request}
        return Response(FeedbackSerializer(feedback, many=True, context=context).data)

    @extend_schema(
        request=FeedbackWriteSerializer,
        responses={201: FeedbackDetailSerializer, 400: ErrorSerializer},
    )
    def post(self, request: Request, slug: str, campaign_slug: str) -> Response:
        if not request.user.is_authenticated:
            return Response(status=status.HTTP_401_UNAUTHORIZED)
        campaign = _campaign(request, slug, campaign_slug)
        serializer = FeedbackWriteSerializer(data=request.data, context={"campaign": campaign})
        if not serializer.is_valid():
            return error_codes(serializer)
        try:
            feedback = create_feedback(campaign, request.user, **serializer.validated_data)
        except CampaignError as exc:
            return _error(exc)
        data = FeedbackDetailSerializer(feedback, context={"request": request}).data
        return Response(data, status=status.HTTP_201_CREATED)


class FeedbackDetailView(APIView):
    permission_classes = (AllowAny,)

    @extend_schema(responses=FeedbackDetailSerializer)
    def get(self, request: Request, slug: str, campaign_slug: str, feedback_id) -> Response:
        feedback = _feedback(request, slug, campaign_slug, feedback_id)
        return Response(FeedbackDetailSerializer(feedback, context={"request": request}).data)

    @extend_schema(
        request=FeedbackWriteSerializer,
        responses={200: FeedbackDetailSerializer, 400: ErrorSerializer},
    )
    def patch(self, request: Request, slug: str, campaign_slug: str, feedback_id) -> Response:
        feedback = _feedback(request, slug, campaign_slug, feedback_id)
        serializer = FeedbackWriteSerializer(
            feedback, data=request.data, partial=True, context={"campaign": feedback.campaign}
        )
        if not serializer.is_valid():
            return error_codes(serializer)
        try:
            feedback = change_feedback(feedback, request.user, **serializer.validated_data)
        except CampaignError as exc:
            return _error(exc)
        feedback = _feedback(request, slug, campaign_slug, feedback.pk)
        return Response(FeedbackDetailSerializer(feedback, context={"request": request}).data)

    @extend_schema(request=None, responses={204: None, 400: ErrorSerializer})
    def delete(self, request: Request, slug: str, campaign_slug: str, feedback_id) -> Response:
        feedback = _feedback(request, slug, campaign_slug, feedback_id)
        try:
            withdraw_feedback(feedback, request.user)
        except CampaignError as exc:
            return _error(exc)
        return Response(status=status.HTTP_204_NO_CONTENT)


class FeedbackStatusView(APIView):
    """POST: the team sets a status; the author confirms a fix or reopens it."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        request=inline_serializer(
            "FeedbackStatusChangeRequest",
            {
                "status": serializers.ChoiceField(choices=Feedback.Status.choices),
                "duplicate_of": serializers.UUIDField(required=False, allow_null=True),
            },
        ),
        responses={200: FeedbackDetailSerializer, 400: ErrorSerializer},
    )
    def post(self, request: Request, slug: str, campaign_slug: str, feedback_id) -> Response:
        feedback = _feedback(request, slug, campaign_slug, feedback_id)
        new_status = request.data.get("status")
        if new_status not in Feedback.Status.values:
            return Response({"status": ["invalid_choice"]}, status=status.HTTP_400_BAD_REQUEST)
        duplicate_of = None
        if request.data.get("duplicate_of"):
            try:
                original_id = serializers.UUIDField().to_internal_value(
                    request.data["duplicate_of"]
                )
            except serializers.ValidationError:
                original_id = None
            duplicate_of = Feedback.objects.filter(
                pk=original_id, campaign=feedback.campaign
            ).first()
        try:
            change_status(feedback, request.user, new_status, duplicate_of)
        except CampaignError as exc:
            return _error(exc)
        feedback = _feedback(request, slug, campaign_slug, feedback_id)
        return Response(FeedbackDetailSerializer(feedback, context={"request": request}).data)


class FeedbackPublishView(APIView):
    """POST …/publish/propose/ (team), …/consent/ (author), …/withdraw/ (either)."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        request=None,
        responses={200: FeedbackDetailSerializer, 400: ErrorSerializer},
        operation_id="feedback_publish_action",
    )
    def post(
        self, request: Request, slug: str, campaign_slug: str, feedback_id, action: str
    ) -> Response:
        feedback = _feedback(request, slug, campaign_slug, feedback_id)
        if action not in ("propose", "consent", "withdraw"):
            raise Http404
        try:
            publish_action(feedback, request.user, action)
        except CampaignError as exc:
            return _error(exc)
        feedback = _feedback(request, slug, campaign_slug, feedback_id)
        return Response(FeedbackDetailSerializer(feedback, context={"request": request}).data)


class MyFeedbackView(APIView):
    """The signed-in person's own feedback, also of campaigns they left (ADR 0024)."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(responses=MyFeedbackSerializer(many=True))
    def get(self, request: Request) -> Response:
        feedback = Feedback.objects.filter(
            author=request.user,
            campaign__blocked_at__isnull=True,
            campaign__project__blocked_at__isnull=True,
        ).select_related("campaign__project")
        return Response(MyFeedbackSerializer(feedback, many=True).data)
