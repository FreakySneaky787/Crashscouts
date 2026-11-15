"""Campaign API (WP 3A.1). Unknown, draft and private-to-others campaigns are a plain 404."""

from django.http import Http404
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.api import error_codes
from apps.core.throttling import USER_AND_IP
from apps.projects.policies import can_edit as can_edit_project
from apps.projects.selectors import project_for
from apps.projects.services import has_confirmed_email

from . import status as campaign_status
from .policies import can_edit
from .selectors import campaign_for, campaigns_of
from .serializers import CampaignSerializer, CampaignWriteSerializer
from .services import CampaignError, change_state, create_campaign, delete_draft, update_campaign

ErrorSerializer = inline_serializer("CampaignError", {"code": serializers.CharField()})


def _project(request: Request, slug: str):
    project = project_for(request.user, slug)
    if project is None:
        raise Http404
    return project


def _campaign(request: Request, slug: str, campaign_slug: str):
    campaign = campaign_for(request.user, _project(request, slug), campaign_slug)
    if campaign is None:
        raise Http404
    return campaign


def _error(exc: CampaignError) -> Response:
    forbidden = exc.code == "public_campaigns_locked"
    return Response(
        {"code": exc.code},
        status=status.HTTP_403_FORBIDDEN if forbidden else status.HTTP_400_BAD_REQUEST,
    )


class CampaignListView(APIView):
    """GET: campaigns of a project the viewer may see. POST: new draft (team only)."""

    permission_classes = (AllowAny,)
    throttle_scope = "campaign_create"

    def get_throttles(self):
        return [cls() for cls in USER_AND_IP] if self.request.method == "POST" else []

    @extend_schema(responses=CampaignSerializer(many=True))
    def get(self, request: Request, slug: str) -> Response:
        project = _project(request, slug)
        # All of one project: whether the viewer is its team is decided once (WP 8.6).
        team = can_edit_project(request.user, project)
        campaigns = campaigns_of(request.user, project, team)
        context = {"request": request, "team": team}
        return Response(CampaignSerializer(campaigns, many=True, context=context).data)

    @extend_schema(request=CampaignWriteSerializer, responses={201: CampaignSerializer})
    def post(self, request: Request, slug: str) -> Response:
        if not request.user.is_authenticated:
            raise Http404
        project = _project(request, slug)
        if not can_edit_project(request.user, project):
            raise PermissionDenied  # visible (public) project, but not part of its team
        if not has_confirmed_email(request.user):
            return Response({"code": "email_unconfirmed"}, status=status.HTTP_403_FORBIDDEN)
        serializer = CampaignWriteSerializer(data=request.data, context={"project": project})
        if not serializer.is_valid():
            return error_codes(serializer)
        try:
            campaign = create_campaign(request.user, project, **serializer.validated_data)
        except CampaignError as exc:
            return _error(exc)
        return Response(
            CampaignSerializer(campaign, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class CampaignDetailView(APIView):
    permission_classes = (AllowAny,)

    @extend_schema(responses=CampaignSerializer)
    def get(self, request: Request, slug: str, campaign_slug: str) -> Response:
        campaign = _campaign(request, slug, campaign_slug)
        # Always the current short names; the SSR page redirects former ones.
        return Response(CampaignSerializer(campaign, context={"request": request}).data)

    @extend_schema(
        request=CampaignWriteSerializer, responses={200: CampaignSerializer, 400: ErrorSerializer}
    )
    def patch(self, request: Request, slug: str, campaign_slug: str) -> Response:
        campaign = _campaign(request, slug, campaign_slug)
        if not can_edit(request.user, campaign):
            raise PermissionDenied
        serializer = CampaignWriteSerializer(
            campaign, data=request.data, partial=True, context={"project": campaign.project}
        )
        if not serializer.is_valid():
            return error_codes(serializer)
        try:
            campaign = update_campaign(request.user, campaign, **serializer.validated_data)
        except CampaignError as exc:
            return _error(exc)
        return Response(CampaignSerializer(campaign, context={"request": request}).data)

    @extend_schema(request=None, responses={204: None, 400: ErrorSerializer})
    def delete(self, request: Request, slug: str, campaign_slug: str) -> Response:
        campaign = _campaign(request, slug, campaign_slug)
        if not can_edit(request.user, campaign):
            raise PermissionDenied
        try:
            delete_draft(request.user, campaign)
        except CampaignError as exc:
            return _error(exc)
        return Response(status=status.HTTP_204_NO_CONTENT)


ACTIONS = {
    "publish": campaign_status.PUBLISHED,
    "complete": campaign_status.COMPLETED,
    "cancel": campaign_status.CANCELLED,
}


class CampaignStateView(APIView):
    """POST …/publish/, …/complete/, …/cancel/ (team only)."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        operation_id="projects_campaigns_change_state",
        request=None,
        responses={200: CampaignSerializer, 400: ErrorSerializer, 403: ErrorSerializer},
    )
    def post(self, request: Request, slug: str, campaign_slug: str, action: str) -> Response:
        if action not in ACTIONS:
            raise Http404
        campaign = _campaign(request, slug, campaign_slug)
        if not can_edit(request.user, campaign):
            raise PermissionDenied
        try:
            campaign = change_state(request.user, campaign, ACTIONS[action])
        except CampaignError as exc:
            return _error(exc)
        return Response(CampaignSerializer(campaign, context={"request": request}).data)
