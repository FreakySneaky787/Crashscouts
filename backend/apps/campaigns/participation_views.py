"""Joining, leaving and removing participants (WP 3A.4a)."""

from django.http import Http404
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from .participation import join, leave, remove
from .policies import is_team
from .serializers import CampaignSerializer
from .services import CampaignError
from .views import ErrorSerializer, _campaign, _error


class JoinView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(request=None, responses={200: CampaignSerializer, 400: ErrorSerializer})
    def post(self, request: Request, slug: str, campaign_slug: str) -> Response:
        campaign = _campaign(request, slug, campaign_slug)  # 404 unless the person may see it
        try:
            join(campaign, request.user)
        except CampaignError as exc:
            return _error(exc)
        return Response(CampaignSerializer(campaign, context={"request": request}).data)


class LeaveView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(request=None, responses={204: None, 400: ErrorSerializer})
    def post(self, request: Request, slug: str, campaign_slug: str) -> Response:
        campaign = _campaign(request, slug, campaign_slug)
        try:
            leave(campaign, request.user)
        except CampaignError as exc:
            return _error(exc)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ParticipantRemoveView(APIView):
    """The team removes a participant. 404 outside the team."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(request=None, responses={204: None, 400: ErrorSerializer})
    def delete(self, request: Request, slug: str, campaign_slug: str, username: str) -> Response:
        campaign = _campaign(request, slug, campaign_slug)
        if not is_team(request.user, campaign):
            raise Http404
        try:
            remove(campaign, request.user, username)
        except CampaignError as exc:
            return _error(exc)
        return Response(status=status.HTTP_204_NO_CONTENT)
