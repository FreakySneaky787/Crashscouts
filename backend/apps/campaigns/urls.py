from django.urls import path

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
        "projects/<str:slug>/campaigns/<str:campaign_slug>/<str:action>/",
        CampaignStateView.as_view(),
        name="campaign-state",
    ),
]
