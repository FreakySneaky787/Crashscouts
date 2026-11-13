from django.urls import path

from .invitation_views import (
    CampaignInvitationRevokeView,
    CampaignInvitationsView,
    MyCampaignInvitationAnswerView,
    MyCampaignInvitationsView,
    MyParticipationsView,
)
from .link_views import CampaignLinksView, CampaignLinkView
from .views import CampaignDetailView, CampaignListView, CampaignStateView

urlpatterns = [
    path("projects/<str:slug>/campaigns/", CampaignListView.as_view(), name="campaigns"),
    path(
        "projects/<str:slug>/campaigns/<str:campaign_slug>/",
        CampaignDetailView.as_view(),
        name="campaign-detail",
    ),
    path(
        "projects/<str:slug>/campaigns/<str:campaign_slug>/links/",
        CampaignLinksView.as_view(),
        name="campaign-links",
    ),
    path(
        "projects/<str:slug>/campaigns/<str:campaign_slug>/links/<uuid:link_id>/",
        CampaignLinkView.as_view(),
        name="campaign-link",
    ),
    path(
        "projects/<str:slug>/campaigns/<str:campaign_slug>/invitations/",
        CampaignInvitationsView.as_view(),
        name="campaign-invitations",
    ),
    path(
        "projects/<str:slug>/campaigns/<str:campaign_slug>/invitations/<uuid:invitation_id>/",
        CampaignInvitationRevokeView.as_view(),
        name="campaign-invitation-revoke",
    ),
    path(
        "me/campaign-invitations/",
        MyCampaignInvitationsView.as_view(),
        name="my-campaign-invitations",
    ),
    path(
        "me/campaign-invitations/<uuid:invitation_id>/<str:answer>/",
        MyCampaignInvitationAnswerView.as_view(),
        name="my-campaign-invitation-answer",
    ),
    path("me/participations/", MyParticipationsView.as_view(), name="my-participations"),
    path(
        "projects/<str:slug>/campaigns/<str:campaign_slug>/<str:action>/",
        CampaignStateView.as_view(),
        name="campaign-state",
    ),
]
