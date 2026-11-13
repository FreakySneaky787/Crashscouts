"""Download links API (WP 3A.3). Only the team and participants see links (404 for others);
only the team changes them."""

from django.http import Http404
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.api import error_codes

from .links import add_link, change_link, remove_link
from .models import CampaignLink
from .policies import can_edit, can_see_links
from .serializers import CampaignLinkSerializer, CampaignLinkWriteSerializer
from .services import CampaignError
from .views import ErrorSerializer, _campaign, _error


def _links_campaign(request: Request, slug: str, campaign_slug: str):
    campaign = _campaign(request, slug, campaign_slug)
    if not can_see_links(request.user, campaign):
        raise Http404  # visitors and invited people do not learn anything about the links
    return campaign


def _link(campaign, link_id, *, served: bool = True) -> CampaignLink:
    """``served``: the link is about to be shown to someone (warning page); suspended links are
    served to no one, not even the team."""
    link = (
        CampaignLink.objects.select_related("platform", "campaign__project")
        .filter(campaign=campaign, pk=link_id)
        .first()
    )
    if link is None or (served and link.suspended_at is not None):
        raise Http404
    return link


class CampaignLinksView(APIView):
    permission_classes = (AllowAny,)

    @extend_schema(responses=CampaignLinkSerializer(many=True))
    def get(self, request: Request, slug: str, campaign_slug: str) -> Response:
        campaign = _links_campaign(request, slug, campaign_slug)
        links = CampaignLink.objects.select_related("platform", "campaign__project").filter(
            campaign=campaign
        )
        if not can_edit(request.user, campaign):
            links = links.filter(suspended_at__isnull=True)  # suspended: served to no one
        return Response(CampaignLinkSerializer(links, many=True).data)

    @extend_schema(
        request=CampaignLinkWriteSerializer,
        responses={201: CampaignLinkSerializer, 400: ErrorSerializer},
    )
    def post(self, request: Request, slug: str, campaign_slug: str) -> Response:
        if not request.user.is_authenticated:
            raise Http404
        campaign = _links_campaign(request, slug, campaign_slug)
        if not can_edit(request.user, campaign):
            raise PermissionDenied
        serializer = CampaignLinkWriteSerializer(data=request.data)
        if not serializer.is_valid():
            return error_codes(serializer)
        try:
            link = add_link(request.user, campaign, **serializer.validated_data)
        except CampaignError as exc:
            return _error(exc)
        return Response(CampaignLinkSerializer(link).data, status=status.HTTP_201_CREATED)


class CampaignLinkView(APIView):
    permission_classes = (AllowAny,)

    @extend_schema(responses=CampaignLinkSerializer)
    def get(self, request: Request, slug: str, campaign_slug: str, link_id) -> Response:
        campaign = _links_campaign(request, slug, campaign_slug)
        return Response(CampaignLinkSerializer(_link(campaign, link_id)).data)

    @extend_schema(
        request=CampaignLinkWriteSerializer,
        responses={200: CampaignLinkSerializer, 400: ErrorSerializer},
    )
    def patch(self, request: Request, slug: str, campaign_slug: str, link_id) -> Response:
        campaign = _links_campaign(request, slug, campaign_slug)
        if not can_edit(request.user, campaign):
            raise PermissionDenied
        link = _link(campaign, link_id, served=False)
        serializer = CampaignLinkWriteSerializer(data=request.data, partial=True)
        if not serializer.is_valid():
            return error_codes(serializer)
        try:
            link = change_link(request.user, link, **serializer.validated_data)
        except CampaignError as exc:
            return _error(exc)
        return Response(CampaignLinkSerializer(link).data)

    @extend_schema(request=None, responses={204: None, 400: ErrorSerializer})
    def delete(self, request: Request, slug: str, campaign_slug: str, link_id) -> Response:
        campaign = _links_campaign(request, slug, campaign_slug)
        if not can_edit(request.user, campaign):
            raise PermissionDenied
        try:
            remove_link(request.user, _link(campaign, link_id, served=False))
        except CampaignError as exc:
            return _error(exc)
        return Response(status=status.HTTP_204_NO_CONTENT)
