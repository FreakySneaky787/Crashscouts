"""Team API (WP 2.3). Outside the team the team endpoints are a plain 404."""

from django.http import Http404
from django.utils import timezone
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .models import Invitation, Membership
from .policies import can_delete, can_edit
from .selectors import project_for
from .team import (
    TeamError,
    accept,
    decline,
    invitation_for_invitee,
    invite,
    pending_invitations,
    remove_member,
    revoke,
    transfer_ownership,
)


def _team_project(request: Request, slug: str, *, owner: bool = False):
    project = project_for(request.user, slug)
    if project is None or not can_edit(request.user, project):
        raise Http404
    if owner and not can_delete(request.user, project):
        raise PermissionDenied  # team member, but only the owner may do this
    return project


def _error(exc: TeamError) -> Response:
    code = status.HTTP_403_FORBIDDEN if exc.code == "forbidden" else status.HTTP_400_BAD_REQUEST
    return Response({"code": exc.code}, status=code)


class InvitationSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    username = serializers.CharField(source="invitee.username")
    invited_by = serializers.CharField(source="invited_by.username", default=None)
    expires_at = serializers.DateTimeField()


class TeamView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        responses=inline_serializer(
            "Team",
            {
                "members": serializers.ListField(child=serializers.DictField()),
                "invitations": InvitationSerializer(many=True),
            },
        )
    )
    def get(self, request: Request, slug: str) -> Response:
        project = _team_project(request, slug)
        members = Membership.objects.filter(project=project).select_related("user")
        return Response(
            {
                "members": [
                    {"username": m.user.username, "role": m.role}
                    for m in members.order_by("-role", "created_at")
                ],
                "invitations": InvitationSerializer(
                    pending_invitations(project).order_by("created_at"), many=True
                ).data,
            }
        )


class InvitationCreateView(APIView):
    permission_classes = (IsAuthenticated,)
    throttle_classes = (ScopedRateThrottle,)
    throttle_scope = "project_invite"

    @extend_schema(
        request=inline_serializer("InvitationCreate", {"username": serializers.CharField()}),
        responses={201: InvitationSerializer},
    )
    def post(self, request: Request, slug: str) -> Response:
        project = _team_project(request, slug, owner=True)
        try:
            invitation = invite(project, request.user, str(request.data.get("username", "")))
        except TeamError as exc:
            return _error(exc)
        return Response(InvitationSerializer(invitation).data, status=status.HTTP_201_CREATED)


class InvitationRevokeView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(request=None, responses={204: None})
    def delete(self, request: Request, slug: str, invitation_id) -> Response:
        project = _team_project(request, slug, owner=True)
        invitation = pending_invitations(project).filter(pk=invitation_id).first()
        if invitation is None:
            raise Http404
        revoke(invitation)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MemberRemoveView(APIView):
    """The owner removes a maintainer, or a maintainer leaves the project."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(request=None, responses={204: None})
    def delete(self, request: Request, slug: str, username: str) -> Response:
        project = _team_project(request, slug)
        try:
            remove_member(project, request.user, username)
        except TeamError as exc:
            return _error(exc)
        return Response(status=status.HTTP_204_NO_CONTENT)


class TransferView(APIView):
    permission_classes = (IsAuthenticated,)
    throttle_classes = (ScopedRateThrottle,)
    throttle_scope = "account_sensitive"

    @extend_schema(
        request=inline_serializer(
            "OwnershipTransfer",
            {"username": serializers.CharField(), "password": serializers.CharField()},
        ),
        responses={204: None},
    )
    def post(self, request: Request, slug: str) -> Response:
        project = _team_project(request, slug, owner=True)
        if not request.user.has_usable_password():
            return Response({"code": "no_password"}, status=status.HTTP_400_BAD_REQUEST)
        if not request.user.check_password(str(request.data.get("password", ""))):
            return Response({"code": "wrong_password"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            transfer_ownership(project, request.user, str(request.data.get("username", "")))
        except TeamError as exc:
            return _error(exc)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MyInvitationSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    project_name = serializers.CharField(source="project.name")
    project_slug = serializers.CharField(source="project.slug")
    invited_by = serializers.CharField(source="invited_by.username", default=None)
    expires_at = serializers.DateTimeField()


class MyInvitationsView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(responses=MyInvitationSerializer(many=True))
    def get(self, request: Request) -> Response:
        invitations = (
            Invitation.objects.filter(
                invitee=request.user,
                status=Invitation.Status.PENDING,
                expires_at__gt=timezone.now(),
            )
            .select_related("project", "invited_by")
            .order_by("-created_at")
        )
        return Response(MyInvitationSerializer(invitations, many=True).data)


class InvitationAnswerView(APIView):
    """Accept or decline one's own invitation; anything else is a plain 404."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(request=None, responses={204: None})
    def post(self, request: Request, invitation_id, answer: str) -> Response:
        invitation = invitation_for_invitee(request.user, invitation_id)
        if invitation is None or answer not in {"accept", "decline"}:
            raise Http404
        if answer == "accept":
            accept(invitation)
        else:
            decline(invitation)
        return Response(status=status.HTTP_204_NO_CONTENT)
