"""Applications API (WP 3A.4b). Answers are visible to the team only; applicants see the status
of their own application."""

from django.http import Http404
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.profiles.models import Profile
from apps.profiles.serializers import PublicProfileSerializer

from .applications import apply, approve, reject, withdraw
from .models import Application
from .policies import is_team
from .serializers import CampaignSerializer
from .services import CampaignError
from .views import ErrorSerializer, _campaign, _error


class AnswerSerializer(serializers.Serializer):
    prompt = serializers.CharField()
    value = serializers.CharField()


class TeamApplicationSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    username = serializers.CharField(source="applicant.username")
    created_at = serializers.DateTimeField()
    answers = AnswerSerializer(many=True)
    profile = serializers.SerializerMethodField()

    def get_profile(self, application) -> dict:
        profile, _ = Profile.objects.get_or_create(user=application.applicant)
        return PublicProfileSerializer(profile).data


class ApplyView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        request=inline_serializer("ApplicationCreate", {"answers": serializers.DictField()}),
        responses={201: CampaignSerializer, 400: ErrorSerializer},
    )
    def post(self, request: Request, slug: str, campaign_slug: str) -> Response:
        campaign = _campaign(request, slug, campaign_slug)  # 404 unless visible
        try:
            apply(campaign, request.user, request.data.get("answers", {}))
        except CampaignError as exc:
            return _error(exc)
        return Response(
            CampaignSerializer(campaign, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class WithdrawView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(request=None, responses={204: None, 400: ErrorSerializer})
    def post(self, request: Request, slug: str, campaign_slug: str) -> Response:
        campaign = _campaign(request, slug, campaign_slug)
        try:
            withdraw(campaign, request.user)
        except CampaignError as exc:
            return _error(exc)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ApplicationsView(APIView):
    """Open applications with answers; team only (404 for everyone else)."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(responses=TeamApplicationSerializer(many=True))
    def get(self, request: Request, slug: str, campaign_slug: str) -> Response:
        campaign = _campaign(request, slug, campaign_slug)
        if not is_team(request.user, campaign):
            raise Http404
        applications = (
            Application.objects.filter(
                campaign=campaign,
                status=Application.Status.PENDING,
                applicant__deletion_scheduled_for__isnull=True,
            )
            .select_related("applicant__profile")
            .prefetch_related("answers")
        )
        return Response(TeamApplicationSerializer(applications, many=True).data)


class ApplicationDecisionView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        operation_id="projects_campaigns_applications_decide",
        request=None,
        responses={204: None, 400: ErrorSerializer},
    )
    def post(
        self, request: Request, slug: str, campaign_slug: str, application_id, decision: str
    ) -> Response:
        campaign = _campaign(request, slug, campaign_slug)
        if not is_team(request.user, campaign) or decision not in {"approve", "reject"}:
            raise Http404
        try:
            if decision == "approve":
                approve(campaign, request.user, application_id)
            else:
                reject(campaign, request.user, application_id)
        except CampaignError as exc:
            return _error(exc)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MyApplicationSerializer(serializers.Serializer):
    campaign_title = serializers.CharField(source="campaign.title")
    campaign_slug = serializers.CharField(source="campaign.slug")
    project_name = serializers.CharField(source="campaign.project.name")
    project_slug = serializers.CharField(source="campaign.project.slug")
    status = serializers.CharField()
    created_at = serializers.DateTimeField()


class MyApplicationsView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(responses=MyApplicationSerializer(many=True))
    def get(self, request: Request) -> Response:
        applications = (
            Application.objects.filter(
                applicant=request.user,
                status__in=[Application.Status.PENDING, Application.Status.REJECTED],
            )
            .select_related("campaign__project")
            .order_by("-created_at")
        )
        return Response(MyApplicationSerializer(applications, many=True).data)
