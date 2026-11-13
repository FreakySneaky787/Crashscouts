"""Invitations to private campaigns and the team's view of participants (WP 3A.5).

Team endpoints are a plain 404 outside the team; an invitee only ever sees their own invitations.
"""

from django.http import Http404
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.throttling import USER_AND_IP
from apps.profiles.models import Profile
from apps.profiles.serializers import PublicProfileSerializer

from .invitations import (
    accept,
    decline,
    invitation_for_invitee,
    invite,
    open_invitations_of,
    participations_of,
    pending_invitations,
    revoke,
)
from .models import Participation
from .policies import is_team
from .services import CampaignError
from .views import ErrorSerializer, _campaign, _error


def _team_campaign(request: Request, slug: str, campaign_slug: str):
    campaign = _campaign(request, slug, campaign_slug)
    if not is_team(request.user, campaign):
        raise Http404
    return campaign


class CampaignInvitationSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    username = serializers.CharField(source="invitee.username")
    invited_by = serializers.CharField(source="invited_by.username", default=None)
    expires_at = serializers.DateTimeField()


class ParticipantSerializer(serializers.Serializer):
    """For the team only: username, joining date and what the person made public."""

    username = serializers.CharField(source="user.username")
    joined_at = serializers.DateTimeField(source="created_at")
    profile = serializers.SerializerMethodField()

    def get_profile(self, participation) -> dict:
        profile, _ = Profile.objects.get_or_create(user=participation.user)
        return PublicProfileSerializer(profile).data


class CampaignInvitationsView(APIView):
    """GET: open invitations and participants (team). POST: invite by username (team)."""

    permission_classes = (IsAuthenticated,)
    throttle_scope = "campaign_invite"

    def get_throttles(self):
        return [cls() for cls in USER_AND_IP] if self.request.method == "POST" else []

    @extend_schema(
        responses=inline_serializer(
            "CampaignTesters",
            {
                "invitations": CampaignInvitationSerializer(many=True),
                "participants": ParticipantSerializer(many=True),
            },
        )
    )
    def get(self, request: Request, slug: str, campaign_slug: str) -> Response:
        campaign = _team_campaign(request, slug, campaign_slug)
        participants = (
            # Accounts in their deletion grace period keep their place but are not listed
            # (invisible like everywhere else, WP 3A.6).
            Participation.objects.filter(
                campaign=campaign,
                status=Participation.Status.ACTIVE,
                user__deletion_scheduled_for__isnull=True,
            )
            .select_related("user__profile")
            .order_by("created_at")
        )
        return Response(
            {
                "invitations": CampaignInvitationSerializer(
                    pending_invitations(campaign).order_by("created_at"), many=True
                ).data,
                "participants": ParticipantSerializer(participants, many=True).data,
            }
        )

    @extend_schema(
        request=inline_serializer(
            "CampaignInvitationCreate", {"username": serializers.CharField()}
        ),
        responses={201: CampaignInvitationSerializer, 400: ErrorSerializer},
    )
    def post(self, request: Request, slug: str, campaign_slug: str) -> Response:
        campaign = _team_campaign(request, slug, campaign_slug)
        try:
            invitation = invite(campaign, request.user, str(request.data.get("username", "")))
        except CampaignError as exc:
            return _error(exc)
        return Response(
            CampaignInvitationSerializer(invitation).data, status=status.HTTP_201_CREATED
        )


class CampaignInvitationRevokeView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(request=None, responses={204: None})
    def delete(self, request: Request, slug: str, campaign_slug: str, invitation_id) -> Response:
        campaign = _team_campaign(request, slug, campaign_slug)
        invitation = pending_invitations(campaign).filter(pk=invitation_id).first()
        if invitation is None:
            raise Http404
        revoke(invitation)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MyCampaignInvitationSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    campaign_title = serializers.CharField(source="campaign.title")
    campaign_slug = serializers.CharField(source="campaign.slug")
    project_name = serializers.CharField(source="campaign.project.name")
    project_slug = serializers.CharField(source="campaign.project.slug")
    invited_by = serializers.CharField(source="invited_by.username", default=None)
    expires_at = serializers.DateTimeField()


class MyCampaignInvitationsView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(responses=MyCampaignInvitationSerializer(many=True))
    def get(self, request: Request) -> Response:
        return Response(
            MyCampaignInvitationSerializer(open_invitations_of(request.user), many=True).data
        )


class MyCampaignInvitationAnswerView(APIView):
    """Accept or decline one's own invitation; anything else is a plain 404."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(request=None, responses={204: None, 400: ErrorSerializer})
    def post(self, request: Request, invitation_id, answer: str) -> Response:
        invitation = invitation_for_invitee(request.user, invitation_id)
        if invitation is None or answer not in {"accept", "decline"}:
            raise Http404
        try:
            if answer == "accept":
                accept(invitation)
            else:
                decline(invitation)
        except CampaignError as exc:
            return _error(exc)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MyParticipationSerializer(serializers.Serializer):
    campaign_title = serializers.CharField(source="campaign.title")
    campaign_slug = serializers.CharField(source="campaign.slug")
    project_name = serializers.CharField(source="campaign.project.name")
    project_slug = serializers.CharField(source="campaign.project.slug")
    joined_at = serializers.DateTimeField(source="created_at")


class MyParticipationsView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(responses=MyParticipationSerializer(many=True))
    def get(self, request: Request) -> Response:
        return Response(MyParticipationSerializer(participations_of(request.user), many=True).data)
