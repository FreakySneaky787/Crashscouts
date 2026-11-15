"""Growth metrics API (WP M.1, ADR 0030): admins only, a plain 404 for everyone else."""

from django.http import Http404
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.roles import is_admin

from .queries import metrics


class MetricsView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        operation_id="platform_metrics",
        responses=inline_serializer("GrowthMetrics", {"x": serializers.CharField()}),
    )
    def get(self, request: Request) -> Response:
        if not is_admin(request.user):
            raise Http404
        response = Response(metrics())
        response["Cache-Control"] = "private, no-store"
        return response
