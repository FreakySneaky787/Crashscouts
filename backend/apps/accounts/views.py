"""Account deletion and data export (WP 1.5). Both need the current password, and are throttled."""

from datetime import date

from django.contrib.auth import logout
from django.http import JsonResponse
from drf_spectacular.utils import OpenApiTypes, extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.core.api import error_codes

from .lifecycle import export_data, request_deletion


class PasswordSerializer(serializers.Serializer):
    password = serializers.CharField(max_length=256, trim_whitespace=False)

    def validate_password(self, value: str) -> str:
        user = self.context["request"].user
        if not user.has_usable_password():
            # GitHub-only accounts first set a password via "Forgot your password?".
            raise serializers.ValidationError("Set a password first.", code="no_password")
        if not user.check_password(value):
            raise serializers.ValidationError("The password is incorrect.", code="wrong_password")
        return value


class DeletionSerializer(PasswordSerializer):
    confirm = serializers.BooleanField()

    def validate_confirm(self, value: bool) -> bool:
        if value is not True:
            raise serializers.ValidationError(
                "Confirm that you want to delete your account.", code="required"
            )
        return value


class AccountDeletionView(APIView):
    permission_classes = (IsAuthenticated,)
    throttle_classes = (ScopedRateThrottle,)
    throttle_scope = "account_sensitive"

    @extend_schema(
        request=DeletionSerializer,
        responses={
            202: inline_serializer(
                "DeletionScheduled", {"deletion_scheduled_for": serializers.DateTimeField()}
            )
        },
    )
    def post(self, request: Request) -> Response:
        serializer = DeletionSerializer(data=request.data, context={"request": request})
        if not serializer.is_valid():
            return error_codes(serializer)
        user = request.user
        request_deletion(user)
        logout(request)
        return Response(
            {"deletion_scheduled_for": user.deletion_scheduled_for.isoformat()},
            status=status.HTTP_202_ACCEPTED,
        )


class DataExportView(APIView):
    permission_classes = (IsAuthenticated,)
    throttle_classes = (ScopedRateThrottle,)
    throttle_scope = "account_sensitive"

    @extend_schema(
        request=PasswordSerializer, responses={(200, "application/json"): OpenApiTypes.OBJECT}
    )
    def post(self, request: Request) -> JsonResponse:
        serializer = PasswordSerializer(data=request.data, context={"request": request})
        if not serializer.is_valid():
            return error_codes(serializer)
        response = JsonResponse(export_data(request.user), json_dumps_params={"indent": 2})
        response["Content-Disposition"] = (
            f'attachment; filename="personal-data-{date.today():%Y-%m-%d}.json"'
        )
        response["Cache-Control"] = "private, no-store"
        return response
