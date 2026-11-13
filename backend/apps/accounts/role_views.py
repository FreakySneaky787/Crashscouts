"""Platform roles API (WP 3B.1). Everything here is a plain 404 for anyone but an admin."""

from allauth.mfa.utils import is_mfa_enabled
from django.contrib.auth import get_user_model
from django.http import Http404
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .roles import ROLES, RoleError, effective_role, is_admin, set_role


class RoleEntrySerializer(serializers.Serializer):
    username = serializers.CharField()
    role = serializers.CharField(source="platform_role")
    two_factor = serializers.SerializerMethodField()

    def get_two_factor(self, user) -> bool:
        return is_mfa_enabled(user)


class RoleChangeSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=30)
    role = serializers.ChoiceField(choices=[r or "none" for r in ROLES])
    password = serializers.CharField(max_length=256, trim_whitespace=False)


class PlatformRolesView(APIView):
    permission_classes = (IsAuthenticated,)
    throttle_scope = "account_sensitive"

    def get_throttles(self):
        return [ScopedRateThrottle()] if self.request.method == "POST" else []

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if not is_admin(request.user):
            raise Http404

    @extend_schema(responses=RoleEntrySerializer(many=True))
    def get(self, request: Request) -> Response:
        users = (
            get_user_model()
            .objects.exclude(platform_role="")
            .filter(is_active=True)
            .order_by("username")
        )
        return Response(RoleEntrySerializer(users, many=True).data)

    @extend_schema(
        request=RoleChangeSerializer,
        responses={
            204: None,
            400: inline_serializer("RoleError", {"code": serializers.CharField()}),
        },
    )
    def post(self, request: Request) -> Response:
        serializer = RoleChangeSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"code": "invalid"}, status=status.HTTP_400_BAD_REQUEST)
        data = serializer.validated_data
        if not request.user.check_password(data["password"]):
            return Response({"code": "wrong_password"}, status=status.HTTP_400_BAD_REQUEST)
        role = "" if data["role"] == "none" else data["role"]
        try:
            set_role(data["username"], role, by=request.user)
        except RoleError as exc:
            return Response({"code": exc.code}, status=status.HTTP_400_BAD_REQUEST)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MyRoleView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        responses=inline_serializer("MyPlatformRole", {"platform_role": serializers.CharField()})
    )
    def get(self, request: Request) -> Response:
        return Response({"platform_role": effective_role(request.user) or "none"})
