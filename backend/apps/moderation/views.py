"""Reporting API (WP 3B.2)."""

from django.http import Http404
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.api import error_codes
from apps.core.throttling import USER_AND_IP

from .models import TEXT_MAX_LENGTH, Report
from .services import NotVisible, ReportError, report, reports_of, resolve_target


class ReportCreateSerializer(serializers.Serializer):
    target_type = serializers.ChoiceField(choices=Report.TargetType.choices)
    project = serializers.CharField(max_length=40, required=False, allow_blank=True)
    campaign = serializers.CharField(max_length=40, required=False, allow_blank=True)
    link = serializers.UUIDField(required=False, allow_null=True)
    username = serializers.CharField(max_length=150, required=False, allow_blank=True)
    feedback = serializers.UUIDField(required=False, allow_null=True)
    reason = serializers.ChoiceField(choices=Report.Reason.choices)
    text = serializers.CharField(max_length=TEXT_MAX_LENGTH, required=False, allow_blank=True)


class MyReportSerializer(serializers.Serializer):
    target_type = serializers.CharField()
    target_label = serializers.CharField()
    reason = serializers.CharField()
    status = serializers.CharField()
    created_at = serializers.DateTimeField()


class ReportCreateView(APIView):
    permission_classes = (IsAuthenticated,)
    throttle_classes = USER_AND_IP
    throttle_scope = "report"

    @extend_schema(
        request=ReportCreateSerializer,
        responses={
            201: None,
            400: inline_serializer("ReportError", {"code": serializers.CharField()}),
        },
    )
    def post(self, request: Request) -> Response:
        serializer = ReportCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return error_codes(serializer)
        data = serializer.validated_data
        try:
            target = resolve_target(
                request.user,
                data["target_type"],
                data.get("project", ""),
                data.get("campaign", ""),
                data.get("link"),
                username=data.get("username", ""),
                feedback=data.get("feedback"),
            )
        except NotVisible:
            raise Http404 from None
        try:
            report(request.user, target, data["reason"], data.get("text", ""))
        except ReportError as exc:
            code = status.HTTP_403_FORBIDDEN if exc.code == "email_unconfirmed" else 400
            return Response({"code": exc.code}, status=code)
        return Response(status=status.HTTP_201_CREATED)


class MyReportsView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(responses=MyReportSerializer(many=True))
    def get(self, request: Request) -> Response:
        return Response(MyReportSerializer(reports_of(request.user), many=True).data)
