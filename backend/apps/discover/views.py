"""Discover API (phase 6, ADR 0025): public and read-only; throttled per IP address."""

from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.campaigns import status as campaign_status
from apps.campaigns.models import Campaign
from apps.catalog.serializers import CatalogItemSerializer
from apps.core.throttling import IPScopedRateThrottle
from apps.projects.models import Project

from . import queries

MAX_QUERY_LENGTH = 200


class DiscoverProjectSerializer(serializers.Serializer):
    slug = serializers.CharField()
    name = serializers.CharField()
    summary = serializers.CharField()
    logo_key = serializers.UUIDField(allow_null=True)
    open_source = serializers.BooleanField(source="is_open_source")
    status = serializers.ChoiceField(choices=Project.Status.choices)
    platforms = CatalogItemSerializer(many=True)
    software_types = CatalogItemSerializer(many=True)
    active_campaigns = serializers.IntegerField()
    last_activity = serializers.DateTimeField()
    created_at = serializers.DateTimeField()


class DiscoverCampaignSerializer(serializers.Serializer):
    project = serializers.CharField(source="project.slug")
    project_name = serializers.CharField(source="project.name")
    open_source = serializers.BooleanField(source="project.is_open_source")
    slug = serializers.CharField()
    title = serializers.CharField()
    summary = serializers.CharField()
    status = serializers.SerializerMethodField()
    starts_at = serializers.DateTimeField()
    ends_at = serializers.DateTimeField()
    timezone = serializers.CharField()
    participants = serializers.IntegerField()
    target_testers = serializers.IntegerField()
    method = serializers.ChoiceField(choices=Campaign.Method.choices)
    platforms = CatalogItemSerializer(many=True)
    last_activity = serializers.DateTimeField()

    def get_status(self, campaign) -> str:
        return campaign_status.effective_status(
            campaign.state,
            starts_at=campaign.starts_at,
            now=timezone.now(),
            participants=campaign.participants,
            target=campaign.target_testers,
        )


def _page(serializer_class, name: str):
    return inline_serializer(
        name,
        {
            "results": serializer_class(many=True),
            "total": serializers.IntegerField(),
            "page": serializers.IntegerField(),
            "pages": serializers.IntegerField(),
        },
    )


COMMON = [
    OpenApiParameter("q", str, description="Search words (all must match, also as prefixes)."),
    OpenApiParameter("category", str),
    OpenApiParameter("language", str),
    OpenApiParameter("software_type", str),
    OpenApiParameter("platform", str),
    OpenApiParameter("open_source", str, enum=["all"], description="'all' also shows others."),
    OpenApiParameter("sort", str, enum=["active", "new"]),
    OpenApiParameter("page", int),
]


def _params(request: Request) -> tuple[dict, str, str, int]:
    get = request.query_params.get
    filters = {
        key: get(key, "")[:60]
        for key in ("category", "language", "software_type", "platform", "status", "method")
    }
    filters["open_source"] = get("open_source") != "all"
    filters["has_campaign"] = get("has_campaign") == "1"
    filters["free_places"] = get("free_places") == "1"
    try:
        page = int(get("page", "1"))
    except ValueError:
        page = 1
    sort = "new" if get("sort") == "new" else "active"
    return filters, get("q", "")[:MAX_QUERY_LENGTH], sort, page


def _response(result: queries.Page, serializer_class) -> Response:
    return Response(
        {
            "results": serializer_class(result.items, many=True).data,
            "total": result.total,
            "page": result.page,
            "pages": result.pages,
        }
    )


class DiscoverView(APIView):
    permission_classes = (AllowAny,)
    throttle_classes = (IPScopedRateThrottle,)
    throttle_scope = "discover"


class DiscoverProjectsView(DiscoverView):
    @extend_schema(
        parameters=[
            *COMMON,
            OpenApiParameter("status", str, enum=Project.Status.values),
            OpenApiParameter("has_campaign", str, enum=["1"]),
        ],
        responses=_page(DiscoverProjectSerializer, "DiscoverProjects"),
    )
    def get(self, request: Request) -> Response:
        filters, q, sort, page = _params(request)
        return _response(
            queries.projects(filters, q=q, sort=sort, page=page), DiscoverProjectSerializer
        )


class DiscoverCampaignsView(DiscoverView):
    @extend_schema(
        parameters=[
            *COMMON,
            OpenApiParameter("method", str, enum=Campaign.Method.values),
            OpenApiParameter("free_places", str, enum=["1"]),
        ],
        responses=_page(DiscoverCampaignSerializer, "DiscoverCampaigns"),
    )
    def get(self, request: Request) -> Response:
        filters, q, sort, page = _params(request)
        return _response(
            queries.campaigns(filters, q=q, sort=sort, page=page), DiscoverCampaignSerializer
        )
